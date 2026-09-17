# Hosting and standalone use

Both versions generate manufacturing ZIPs in the browser. **Send ZIP** posts to the same origin's `/api/jlcpcb/upload`, which streams to JLCPCB and returns a quote URL. There is no hardcoded hosted Overprint endpoint and no storage service or account requirement.

## Standalone: run it on your own machine

Install Bun (tested with 1.3.14), Node.js 22.18+ and Python 3, then from the source directory:

```sh
bun install --frozen-lockfile
bun start
```

Open **http://127.0.0.1:4317**. `bun start` builds the current source and the KiCad plugin, then runs the production server under Node.js. It listens only on loopback by default. Ctrl+C stops it. No Cloudflare login or credentials are needed. Installation needs an internet connection to download dependencies; a startup build uses installed dependencies. The editor's fonts and assets are served locally.

Choose a different port if another copy is running:

```sh
PORT=4321 bun start
```

On shells without inline environment assignments, set `PORT` through the shell's environment-variable syntax first. `HOST` or `NITRO_HOST` can explicitly change the listening interface. Keep the default for personal use; binding `0.0.0.0` exposes the server to your network.

For repeat launches without rebuilding:

```sh
HOST=127.0.0.1 PORT=4317 node apps/web/.output/standalone/server/index.mjs
```

Keep the explicit host and port for direct launches: Nitro's own defaults differ from the launcher.

Local Send ZIP goes **browser → your local process → JLCPCB**. It never uses our hosted relay. JLCPCB still receives files you choose to send. Download ZIP makes no upload. Projects remain in browser storage, which is separate for each origin/port: download and open a `.overprint` project to move between hosted and local copies.

## Cloudflare Pages

Production uses Cloudflare Pages Git integration on `main`. GitHub Actions runs verification separately; `DEPLOY_ENABLED=false` disables the alternative Actions deployment job. Pages Git deployments do **not** wait for Actions. Require the verification check on pull requests and protect `main` if you want it to gate changes before deployment.

Do not enable both deployment methods. See [DevOps setup](devops.md) for the optional deployment of verified artifacts through Actions.

Build and preview locally:

```sh
bun install --frozen-lockfile
bun run build:cloudflare
bun run preview:cloudflare
```

Open **http://127.0.0.1:4318**. Preview uses local workerd; it does not deploy or publish anything. Its Send ZIP route contacts real JLCPCB if clicked.

Pages project settings:

| Setting | Value |
| --- | --- |
| Build command | `bun install --frozen-lockfile && bun run build:cloudflare` |
| Output directory | `apps/web/.output/cloudflare` |
| Build dependencies | Bun 1.3.14, Node.js 22.18+ and Python 3 |
| Build environment | `BUN_VERSION=1.3.14`, `NODE_VERSION=22.18.0`, `SKIP_DEPENDENCY_INSTALL=1` |
| Compatibility date | `2026-09-16` |
| Compatibility flag | `nodejs_compat` |
| Storage bindings / secrets | None |

Bun is the package manager for both targets; `bun.lock` is the only dependency lockfile. The Pages build explicitly runs a frozen Bun install, with automatic dependency installation disabled using the [documented build variables](https://developers.cloudflare.com/pages/configuration/build-image/). Set these variables in the Pages build settings, not Worker runtime bindings.

The committed `wrangler.jsonc` contains the output directory and runtime settings. The two builds use separate output directories, so building one does not replace the other. Static assets use Nitro's generated `_routes.json`; the upload bypasses Nitro's body-buffering adapter. Keep the generated `_worker.js` directory and `_routes.json` together with the public files.

For manual deployment, authenticate Wrangler and run `wrangler pages deploy apps/web/.output/cloudflare --project-name <your-project>`.

Before public traffic, configure a Cloudflare rate-limiting rule for **POST `/api/jlcpcb/upload`** on the chosen hostname. The origin check is a browser protection, not authentication or an abuse limit. The standalone concurrency limit does not apply across Workers. Review request logging and avoid payload logging, storage bindings, or caches for the relay.

After deployment, verify one synthetic ZIP reaches JLCPCB from Cloudflare's production network and opens its quote, then check KiCad sync permissions from the real HTTPS origin. Keep Download ZIP available if JLCPCB changes or blocks the undocumented upload endpoint.

The relay allows 20 MB per ZIP and times out after 60 seconds. Standalone admits four simultaneous uploads and can queue up to 80 MB of ZIP data in memory, plus runtime overhead.

## Runtime checks

```sh
bun run build
bun run build:cloudflare
bun run test:server
bun run test:standalone
bun run test:cloudflare
```

Standalone checks exercise the built server under Bun and Node with a test-only JLC mock. The Pages test uses the built Worker in workerd, checks rejected origins/content types/oversized files, and pauses the incoming upload until its first bytes reach a mock upstream. Neither suite sends a board to JLCPCB.

### Why these adapters exist

The installed Nitro 2.13.4 native Bun and Pages adapters buffer incoming bodies. Standalone uses the Node.js server. Pages uses a small entry wrapper only for the upload endpoint; other routes still use Nitro. The shared relay uses Web Streams and Cloudflare's `FixedLengthStream` so JLCPCB receives a multipart Content-Length without collecting the whole ZIP. Redirects are handled manually and rejected; Workers does not implement `redirect: "error"`.

References: [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Nitro Cloudflare deployment](https://nitro.build/deploy/providers/cloudflare), [FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream).
