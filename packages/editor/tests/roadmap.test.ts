import { test, expect } from 'bun:test'
import { clipPolygons, polygonArea, renderVector } from '../../../apps/web/app/utils/vectorArtwork'
import { repeatedArtwork, snapBoardPoint } from '../../../apps/web/app/utils/placement'
import { compareBoardRevision } from '../../../apps/web/app/utils/boardChange'
const rectangle = (x: number, y: number, w: number, h: number): [number, number][] => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
const board = { name: 'Test', bounds: { x: 10, y: 20, width: 40, height: 30 }, outline: 'M10 20 L50 20 L50 50 L10 50 Z', holes: '', layers: {}, anchors: [{ kind: 'pad' as const, name: 'J1.1', x: 24.4, y: 31.2 }] }
const item = { id: 'a', name: 'a', side: 'back', x: 20, y: 30, width: 4, height: 2, rotation: 90, visible: true, source: '<svg/>' }
test('Boolean operations preserve holes and true intersected area', () => {
 const outer = [rectangle(0,0,10,10)], inside = [rectangle(2,2,4,4)]
 expect(polygonArea(clipPolygons(outer, inside, 'subtract'))).toBe(84)
 expect(polygonArea(clipPolygons(outer, inside, 'union'))).toBe(100)
 expect(polygonArea(clipPolygons(outer, inside, 'intersect'))).toBe(16)
})
test('vectors validate frozen closed and open paths without aliasing nodes', () => {
 const v = { version: 1 as const, width: 10, height: 10, fill: '#ffd426', stroke: 'none', strokeWidth: 0, contours: [{ closed: true, points: rectangle(0,0,10,10) }] }
 const rendered = renderVector(v); v.contours[0]!.points[0]![0] = 9
 expect(rendered.vector.contours[0]!.points[0]![0]).toBe(0)
 expect(rendered.source).toContain('fill-rule="evenodd"')
 expect(() => renderVector({ ...v, contours: [{ closed: true, points: [[0,0], [1,1]] }] })).toThrow()
})
test('snapping uses the board origin, pad anchors and center', () => {
 expect(snapBoardPoint({ x: 12.1, y: 22.8 }, board, 'back', 1)).toMatchObject({ x:12,y:23 })
 expect(snapBoardPoint({ x: 24.5, y: 31.3 }, board, 'back', 1)).toMatchObject({ x:24.4,y:31.2,name:'Pad J1.1' })
 expect(snapBoardPoint({ x: 30.1, y: 35.1 }, board, 'back', 1)).toMatchObject({ x:30,y:35,name:'Board center' })
})
test('line and circle repetitions keep rear geometry and rotation; malformed counts fail', () => {
 const line = repeatedArtwork([item], 'line', 3, 2, -1, 10)
 expect(line.map(i => [i.x,i.y,i.rotation,i.side])).toEqual([[22,29,90,'back'],[24,28,90,'back']])
 expect(new Set(line.map(i=>i.id)).size).toBe(2)
 const circle = repeatedArtwork([item], 'circle', 4, 0, 0, 10)
 expect(circle[0]!.rotation).toBe(180)
 expect(circle[1]!.x).toBeCloseTo(0)
 expect(() => repeatedArtwork([item], 'line', 101, 1, 0, 0)).toThrow()
})
test('PCB comparison reports moved anchors and affected artwork without mutating either revision', () => {
 const next = { ...board, outline: 'M10 20 L55 20 L55 50 L10 50 Z', anchors: [{ ...board.anchors[0]!, x: 25.4 }] }
 const report = compareBoardRevision(board,next,[item])
 expect(report.outlineChanged).toBe(true);expect(report.moved[0]!.after.x).toBe(25.4);expect(report.reviewArtwork.map(i=>i.id)).toEqual(['a']);expect(board.anchors[0]!.x).toBe(24.4)
})
