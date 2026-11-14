import { describe, test, expect } from 'bun:test'
import { defaultStrokeText as defaultText, renderText, textMeasurements } from '../../../apps/web/app/utils/artworkText'

describe('portable editable text outlines', () => {
  test('bundled glyphs generate deterministic filled paths, including Unicode and literal markup', () => {
    const value = { ...defaultText, content: '<PCB> Ω é\nGND 3.3V' }
    const first = renderText(value)
    expect(renderText(value)).toEqual(first)
    expect(first.source).toContain('<path')
    expect(first.source).not.toMatch(/<text|<script|<font|href|<image/)
    expect(first.source).toContain('fill="#f4f1e8"')
    expect(first.width).toBeGreaterThan(0)
    expect(first.height).toBeGreaterThan(defaultText.size)
  })
  test('size and object scaling change the measured physical stroke', () => {
    const a = renderText({ ...defaultText, content: 'HH' })
    const b = renderText({ ...defaultText, content: 'HH', size: 3, stroke: 0.4, tracking: 0.3 })
    expect(b.width / a.width).toBeCloseTo(2, 2)
    expect(b.height / a.height).toBeCloseTo(2, 2)
    const measured = textMeasurements({ id: 'a', name: 'a', side: 'front', x: 0, y: 0, rotation: 0, visible: true, ...a, width: a.width * 0.5, height: a.height * 0.5 })!
    expect(measured.stroke).toBeCloseTo(0.1)
  })
  test('alignment, tracking, monospace and italic affect real geometry', () => {
    const render = (patch = {}) => renderText({ ...defaultText, content: 'WWW\nI', ...patch })
    expect(render({ align: 'right' }).source).not.toBe(render().source)
    expect(render({ tracking: 0.5 }).width).toBeGreaterThan(render().width)
    expect(render({ font: 'newstroke-mono' }).source).not.toBe(render().source)
    expect(render({ italic: true }).source).not.toBe(render().source)
  })
  test('invalid metadata and unsupported glyphs fail before geometry is accepted', () => {
    for (const patch of [{ version: 2 }, { content: '' }, { content: ' '.repeat(8) }, { content: 'a'.repeat(257) }, { content: 'x\n'.repeat(13) }, { size: NaN }, { size: -1 }, { stroke: 0 }, { stroke: 2 }, { font: 'remote' }, { color: 'url(https://example.com)' }, { align: 'diagonal' }, { tracking: Infinity }, { content: '👾' }]) {
      expect(() => renderText({ ...defaultText, ...patch } as any)).toThrow()
    }
  })
})
