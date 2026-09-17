# Privacy

## Editing and saving

Boards, artwork and component models are processed in your browser. Projects autosave in IndexedDB, with no account or cloud project storage. Clearing browser storage removes that copy; download a `.overprint` file to keep a backup.

The KiCad plugin reads the open board, including unsaved edits, without saving or changing the PCB file. Model conversion uses a temporary board snapshot that is removed afterward. Exported packages omit local filesystem paths. Component models stay in projects and are excluded from manufacturing ZIPs.

## KiCad sync

The plugin listens on `127.0.0.1`, on an available port between 43190 and 43199. Overprint scans those ports to find open boards.

`https://overprint.ink`, the configured Overprint address, and local app addresses on ports 3000 and 4317 can see board names and connect automatically. Other websites need approval in KiCad. Your browser may also ask for local-network permission.

Board requests require the approved origin and a random connection token. Tokens stay in browser memory and expire after 30 minutes; reloading clears them. Changing the board or approving another origin revokes the previous token. The plugin accepts no filesystem paths or commands from the browser.

Scanning does not export a board. Opening or syncing fetches a package directly from KiCad to your browser, without passing through the Overprint server. Sync checks board identity and package integrity before updating the board and preserves your artwork.

Use **Tools → External Plugins → Overprint Sync → Stop sync** to stop the listener. Closing its window leaves it running.

## Sending to JLCPCB

**Download ZIP** creates a local file. **Send ZIP** uploads manufacturing files through a relay and opens a JLCPCB quote. Overprint does not place orders or make payments.

- **Hosted app:** browser → Overprint’s Cloudflare relay → JLCPCB.
- **Standalone (`bun start`):** browser → your local server → JLCPCB.

The relay accepts ZIPs up to 20 MB. It does not save them to disk, object storage or application logs. Hosting infrastructure may record request metadata. JLCPCB receives the manufacturing files and applies its own retention and privacy policy.

For server configuration, upload limits and logging guidance, see [Hosting](hosting.md).
