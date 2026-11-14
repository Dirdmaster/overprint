import type { BoardPackage } from './boardPackage'
import type { Artwork } from './artwork'
export const compareBoardRevision = (before: BoardPackage, after: BoardPackage, artwork: Artwork[]) => {
  const changedPaths = (side: string) => {
    const old = new Set(before.layers[`${side}-mask`] ?? []), next = new Set(after.layers[`${side}-mask`] ?? [])
    return { added: [...next].filter(p => !old.has(p)).length, removed: [...old].filter(p => !next.has(p)).length }
  }
  const anchorKey = (a: NonNullable<BoardPackage['anchors']>[number]) => `${a.kind}:${a.name}:${a.side ?? 'both'}`
  const old = new Map((before.anchors ?? []).map(a => [anchorKey(a), a])), next = new Map((after.anchors ?? []).map(a => [anchorKey(a), a]))
  const moved = [...next].filter(([key, a]) => old.has(key) && Math.hypot(a.x - old.get(key)!.x, a.y - old.get(key)!.y) > .001).map(([key, a]) => ({ name: key, before: { x: old.get(key)!.x, y: old.get(key)!.y }, after: { x: a.x, y: a.y } }))
  const front = changedPaths('front'), back = changedPaths('back'), outlineChanged = before.outline !== after.outline || before.holes !== after.holes, boundsChanged = JSON.stringify(before.bounds) !== JSON.stringify(after.bounds)
  return { outlineChanged, boundsChanged, front, back, moved, addedAnchors: [...next.keys()].filter(k => !old.has(k)), removedAnchors: [...old.keys()].filter(k => !next.has(k)), reviewArtwork: artwork.filter(i => !i.kind && !i.nativeSilk && (outlineChanged || boundsChanged || moved.length || (i.side === 'front' ? front.added + front.removed : back.added + back.removed))).map(i => ({ id: i.id, name: i.name, side: i.side })) }
}
