# Pin library placements and retain portable snapshots

Status: accepted for the local workspace feature (#30).

## Context

A library composition can be reused on multiple boards. Designers need both linked placements and independent copies, while older boards and downloaded projects must remain reproducible.

## Decision

Each linked instance pins an immutable library revision and retains a self-contained artwork snapshot in its project. Library changes are offered as explicit updates with a preview. Detaching expands the snapshot into independent editable artwork; placements retain their own transform and board-side assignments.

## Alternatives

Resolving only a live library identifier would reduce duplication, but a deleted library or an imported project on another device could lose its artwork. Automatically following the latest revision would silently change saved boards. Both conflict with the agreed user behavior.

## Consequences

Snapshots consume additional local/project-file space and must obey existing limits. Project import, workspace restore and undo must validate and preserve snapshots and their relationships. A project remains renderable and exportable without access to its source library.
