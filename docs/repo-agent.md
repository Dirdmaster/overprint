# Private repository agent

This service analyzes issues on a dedicated Ubuntu Linux VM after **Dirdmaster assigns the configured bot identity**. It runs Codex through Sandcastle inside a disposable Docker container and saves a private report. It is a dedicated webhook worker, not a general GitHub Actions runner.

The first version does not comment, change labels, edit code, push branches, create PRs, or merge. New issues and comments do not start jobs. The GitHub App needs only repository Contents read, Issues read, and automatic Metadata read access, installed only on Overprint.

## Authorization and lifecycle

The controller verifies the raw webhook body's HMAC signature, repository ID, installation ID, initiating user ID and assignee ID. The configured owner is `Dirdmaster`, numeric ID `48012615`; repository ID is `1374425873`. Verify these when configuring the App. Other users may have GitHub permission to change assignees, but their assignments cannot start this worker.

Only `issues.assigned` events from the owner authorize work. An unassignment, issue closure, or replacement assignment revokes queued/running work. The controller checks the current issue and the latest assignment's actor and timestamp against GitHub before running, periodically while running, and before marking a report complete. If provenance cannot be established, it stops. No polling of existing assignees creates jobs.

The SQLite queue deduplicates delivery IDs and assignment timestamps. Stale assignments cannot undo a newer revocation. Same-second reassignment is deliberately rejected when ambiguous; unassign and assign again after a second. One task runs at a time. Interrupted active jobs become failed at restart and need fresh owner reassignment. Queued jobs survive, but must pass the live checks. Delivery revocation is processed immediately; missed webhooks are caught on the next live check (normally 15 seconds plus bounded GitHub request time; local cancellation and container deadlines do not wait for the API).

The immutable source snapshot comes from the repository's default branch at a resolved commit, never a branch name supplied in issue text. The report records that upstream commit. Its temporary Git commit exists only for Sandcastle's local bookkeeping.

## Process boundaries

- The controller owns webhook validation, queue state, App authentication, source retrieval and Docker access.
- App installation tokens are requested with read-only scopes. They do not enter the container.
- Docker mounts source and issue context read-only. Its root filesystem is read-only, capabilities are dropped, and privilege escalation is disabled. There is no Docker socket, SSH directory or host home mount.
- Each job has 2 CPUs, 2 GiB memory, 128 processes, 512 MiB temporary storage, 32 MiB output storage, and a configurable deadline capped at one hour. Controller-captured output is capped at 2 MiB and the final report at 1 MiB. Source archive extraction is bounded and rejects symlinks, devices, traversal and supplied Git metadata.
- The container receives a dedicated Codex API key in a read-only secret file. This credential is available inside the container, so use a dedicated project/key with an appropriate budget. Container network egress is currently available for inference; this version does not provide a domain firewall.
- The Docker group is privileged on the VM. Only the trusted service account and administrators should belong to it. Keep this VM dedicated to the worker.

The worker pins Sandcastle 0.12.0 and Codex CLI 0.155.1 in an npm lockfile. Sandcastle's `noSandbox()` runs **inside** the already isolated Docker container; it never runs the agent on the VM host. Its default Codex command is overridden to request read-only execution explicitly. The pinned Codex uses `use_legacy_landlock` because Docker's default syscall policy blocks its nested bubblewrap namespaces. This compatibility flag is deprecated upstream: upgrades must repeat the isolation smoke test. There is no fallback to unrestricted execution. Linux must support the required Landlock policy.

## 1. Prepare the VM

Use a dedicated Ubuntu 24.04 or newer Linux VM with Docker Engine, Python 3.12+, Git, OpenSSL and systemd. Start with 2 vCPUs, 4 GiB RAM and 20 GiB disk; this is a starting allocation, not a load-tested capacity estimate. Install Caddy or another TLS reverse proxy. Keep SSH access under your own account and do not expose Docker over TCP.

Get the reviewed repository branch onto the VM. From its root:

```sh
sudo bash scripts/repo_agent/deploy/install.sh
sudo docker build -t overprint-agent-worker:local scripts/repo_agent/worker
sudo docker image inspect overprint-agent-worker:local --format '{{.Id}}'
```

The installer creates the service account and protected directories, copies controller files to `/opt/overprint-agent`, installs the systemd unit, and generates a webhook secret. It preserves existing config/secrets, refuses to replace a running service, and **does not enable or start it**. Record the image ID for configuration. Build on the VM's architecture.

## 2. Select an assignable identity

Register a GitHub App with the read permissions above and only the **Issues** webhook subscription. Initially leave webhook delivery inactive. Install it only on `Dirdmaster/overprint`, record its App ID and installation ID, and generate its private key.

A normal custom App is not guaranteed to appear in GitHub's Assignees picker. Verify the selected identity first. If the App bot is ineligible, create a dedicated machine-user account as the assignee and make it eligible for this repository. The read-only App still handles webhooks and reads; no machine-user access token is needed by this service. Do not silently substitute a label trigger.

GitHub's Copilot-powered Agent Apps are a different execution product; this worker does not use them. Use the App/bot username's numeric account ID for `assignee_id`. To find account IDs:

```sh
gh api users/Dirdmaster --jq '{login,id}'
gh api users/CHOSEN_BOT_LOGIN --jq '{login,id}'
```

The `check` command also calls GitHub's assignability endpoint and refuses to proceed if the identity is ineligible.

## 3. Configure secrets and settings

Fill `/etc/overprint-agent/config.json` using the installed template. Required unresolved values are the installation ID, assignee ID, App ID, immutable Docker image ID (`sha256:...`), and an explicit Codex model available to your API project. The template contains intentionally invalid placeholders and cannot start.

Install the App PEM key at `/etc/overprint-agent/app.pem`. Put a dedicated OpenAI API key in `/etc/overprint-agent/codex-key`. Keep all three secret files and the config owned by `overprint-agent:overprint-agent` with mode `0600`; the directory must be `0700`. Avoid secrets in command-line arguments, shell history, Git, or issue comments. The service rejects symlinked, empty, and group/world-readable secret files.

The API-key path is the prepared authentication mode. Existing desktop ChatGPT/Codex login state is not copied onto the VM or shared across jobs. If subscription authentication is desired, design and validate that separately.

Copy the generated webhook secret into the GitHub App's webhook settings through a private channel. The configured owner/assignee must be different identities. A state directory is tied to its identity policy: changing IDs requires a fresh state directory so old authorizations cannot be reused.

## 4. Check the machine before enabling delivery

Run from the installed controller directory:

```sh
cd /opt/overprint-agent
sudo -u overprint-agent python3 -m scripts.repo_agent check
```

This validates the config, secret file protection, read-scoped App access, account IDs, assignee eligibility, installed image, and a real Docker/Sandcastle/Codex isolation smoke. It makes no model call and posts nothing. It is also the systemd start precondition.

For an image-only smoke without GitHub or model credentials:

```sh
python3 -m scripts.repo_agent smoke --image sha256:YOUR_LOCAL_IMAGE_ID
```

The smoke uses synthetic source with network disabled. It proves that source and system writes fail, that the Docker socket and GitHub credentials are absent, and that Codex's read-only sandbox denies writes even to an outer-container-writable directory. It does not prove inference, GitHub delivery, or the assignee UI interaction.

## 5. Enable TLS and start

Use `scripts/repo_agent/deploy/Caddyfile.example` as a site block in your Caddy configuration. Replace its hostname with a DNS name pointing to the VM. Validate the configuration before reloading. Permit HTTPS and the certificate challenge traffic needed by your reverse proxy. The controller listens on loopback port 8787, and the example proxy exposes only POST `/webhook`.

```sh
sudo systemctl enable --now overprint-agent
sudo systemctl status overprint-agent
curl --fail http://127.0.0.1:8787/healthz
```

`/healthz` reports listener liveness, not model availability. Set the App webhook URL to `https://YOUR_HOST/webhook`, choose JSON, ensure SSL verification is enabled, and activate delivery. Confirm the ping in GitHub's webhook delivery page. Unsubscribe from unrelated events.

## 6. Validate the live assignment path

Use one synthetic test issue. Assign the bot yourself; verify exactly one job starts. Read the private result. Have another account attempt assignment if available; verify it cannot start work. Check unassignment cancellation, duplicate delivery redelivery, and service restart while a task is running. Reassign after cancellation/failure to start a fresh task. Keep this gate open until it is actually exercised on the VM.

A model-generated report is advisory evidence, not proof that a bug is reproduced or that manufacturing output is correct. No report is posted automatically.

## Operations

```sh
cd /opt/overprint-agent
sudo -u overprint-agent python3 -m scripts.repo_agent status
sudo journalctl -u overprint-agent --since today
sudo systemctl stop overprint-agent
```

Completed reports live under `/var/lib/overprint-agent/jobs/JOB_ID/report.md`. A bounded private `diagnostics.txt` may explain a failed container. Treat both as untrusted text; they are never executed or rendered by a public endpoint. Temporary source/context/output is removed after each run and on restart. The filesystem is owner-only. Review disk usage and archive/delete old completed job directories during maintenance; database/delivery records are retained for deduplication.

Stopping the service stops its worker containers. On startup, leftover containers carrying this service's label are removed before new work starts. Do not run multiple installations using that label on the same Docker daemon. Updating the image requires stopping the service, rebuilding, recording the new immutable image ID, running `check`, and restarting. Updating controller files uses the installer while stopped. Neither operation auto-updates source from GitHub.

## Validation and remaining gates

Local tests cover signed HTTP delivery, authorization, replay/reordering, cancellation, restart, policy changes, live assignment provenance, safe archive extraction, redirects and worker lifecycle. The Caddy configuration also passed validation. The real image smoke passed on Linux containers through Docker on the development Mac, without model credentials. The Ubuntu systemd installation, chosen assignee, live GitHub webhook, model credentials and real inference still require the target VM.

References: [GitHub assignment permissions](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/assigning-issues-and-pull-requests-to-other-github-users), [assignability API](https://docs.github.com/en/rest/issues/assignees#check-if-a-user-can-be-assigned), [webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [Sandcastle](https://github.com/mattpocock/sandcastle).
