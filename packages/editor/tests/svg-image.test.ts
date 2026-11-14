import { expect, test } from 'bun:test'
import { svgImageUrl, svgImageAttributes } from '../../../apps/web/app/utils/svgImage'
const decode = (source: string) => decodeURIComponent(svgImageUrl(source).split(',')[1]!)
test('thin SVG images gain a usable intrinsic viewport while retaining viewBox and paths', () => {
 const source = '<svg viewBox="0 0 46 .35"><path fill="#3586e8" d="M0 0H46V.35H0Z"/></svg>'
 const result = decode(source)
 expect(result).toContain('viewBox="0 0 46 .35"')
 expect(result).toContain('height="35"')
 expect(result).toContain('<path fill="#3586e8" d="M0 0H46V.35H0Z"/>')
 const width = Number(result.match(/width="([^"]+)"/)![1]); expect(width / 35).toBeCloseTo(46 / .35)
})
test('ordinary and already sized SVG images remain source-identical', () => {
 for(const source of ['<svg viewBox="0 0 40 28"/>','<svg viewBox="0 0 4600 35" width="4600" height="35"/>']) expect(decode(source)).toBe(source)
})
test('a single explicit dimension preserves its derived aspect ratio and empty SVGs stay self-closing', () => {
 const result = decode('<svg viewBox="0 0 46 .35" width="100"/>')
 expect(result).toContain('/></svg>')
 const width = Number(result.match(/width="([^"]+)"/)![1]), height = Number(result.match(/height="([^"]+)"/)![1])
 expect(width / height).toBeCloseTo(46 / .35)
})

test('an explicitly sized image with a fractional viewBox also receives a stable outer viewport', () => {
 const result = decode('<svg viewBox="0 0 46 .35" width="4600" height="35"/>')
 expect(result).toContain('viewBox="0 0 4600 35"')
 expect(result).toContain('<svg viewBox="0 0 46 .35" width="4600" height="35"/>')
})

test('thin SVG image viewports scale back to their exact physical frame and rear mirror', () => {
 const item = {source:'<svg viewBox="0 0 46 .35"/>',x:9,y:30,width:46,height:.35}
 const frame = svgImageAttributes(item, 'back'), scale = frame.height / item.height
 expect(frame.height).toBe(35)
 expect(frame.width / scale).toBeCloseTo(item.width)
 expect(frame.x / scale).toBeCloseTo(item.x)
 expect(frame.y / scale).toBeCloseTo(item.y)
 expect(frame.transform).toBe(`translate(64 0) scale(-1 1) scale(${1/scale})`)
})
