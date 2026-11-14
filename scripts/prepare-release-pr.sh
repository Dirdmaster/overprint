#!/usr/bin/env bash
set -euo pipefail

bun run version:packages

manifests=(apps/web/package.json packages/editor/package.json packages/kicad/package.json)
if git diff --quiet HEAD -- "${manifests[@]}"; then
  # Empty changesets alone should leave the release PR worktree clean.
  git restore -- .changeset bun.lock
fi

# A changelog may not exist until its package is released for the first time.
# Keep changesets as a pathspec because the action splits its input on commas.
{
  echo 'paths<<RELEASE_PATHS'
  echo '.changeset/*.md'
  git ls-files --cached --others --exclude-standard -- \
    "${manifests[@]}" \
    apps/web/CHANGELOG.md packages/editor/CHANGELOG.md packages/kicad/CHANGELOG.md \
    packages/kicad/metadata.json bun.lock | sort -u
  echo RELEASE_PATHS
} >> "$GITHUB_OUTPUT"
