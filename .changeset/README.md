# Release notes

Run `bun run changeset` for a user-visible change. Select the affected workspace,
choose patch/minor/major, and write a short note describing the effect on users.
Include issue or PR references where useful. Commit the generated Markdown with
the implementation. Use `bun run changeset add --empty` for work needing no release.

The release PR runs `bun run version:packages` to combine these notes, update
package changelogs and versions, synchronize KiCad metadata, and refresh bun.lock.
Use that wrapper rather than calling `changeset version` directly.

See [release preparation](../docs/release.md) for alpha numbering, tags and drafts.
