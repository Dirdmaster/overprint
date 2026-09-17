# Security

Overprint is an alpha. Security fixes target the latest release and `main`.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Dirdmaster/overprint/security/advisories/new). Do not post credentials, private boards, or exploit details in a public issue. If private reporting is unavailable, contact [@Dirdmaster](https://x.com/Dirdmaster) to arrange a private channel before sending details.

Include the affected version, reproduction steps, and expected impact. Use a synthetic board or artwork sample whenever possible.

## Boundaries worth testing

- Untrusted SVGs, board packages, project files, and 3D models.
- The KiCad plugin’s loopback server, origin checks, and pairing tokens.
- The JLCPCB upload relay’s size limits, destination checks, and cancellation.

Self-hosters are responsible for proxy configuration, TLS, access controls, and edge rate limits. See [privacy and transport](docs/privacy.md).
