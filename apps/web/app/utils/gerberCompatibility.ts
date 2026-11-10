import { md5 } from '@noble/hashes/legacy.js'

// This header version and the color SVG version were accepted together
// in Fabrication Toolkit Color's published RP2350B export.
export const withJlcColorHeader = (gerber: string, date = new Date()) => {
  const timestamp = date.toISOString().slice(0, 19).replace('T', ' ')
  const header = `G04 EasyEDA Pro v3.2.148, ${timestamp}*\nG04 Gerber Generator version 0.3*\nG04 Overprint compatibility export from KiCad*\n`
  const content = header + gerber
  const apertures = [...gerber.matchAll(/^%ADD(\d+)[^\r\n]*(\r?\n)/gm)]
  const usedCodes = new Set(apertures.map(match => Number(match[1])).filter(code => code <= 9999))
  let code = Math.max(9, ...usedCodes) + 1
  if (code > 9999) {
    code = 10
    while (usedCodes.has(code)) code++
    if (code > 9999) return content
  }
  const anchor = apertures.at(-1) ?? /^%MOMM\*%(\r?\n)/m.exec(gerber)
  if (!anchor) return content

  // The reference puts the last byte of MD5 modulo 100 in the final two
  // digits of an unused aperture. Preserve all original apertures and draws.
  const suffix = (md5(new TextEncoder().encode(content))[15]! % 100).toString().padStart(2, '0')
  const insert = header.length + anchor.index! + anchor[0].length
  return content.slice(0, insert) + `%ADD${code}C,0.01${suffix}*%${anchor.at(-1)}` + content.slice(insert)
}

const layerNames: Record<string, string> = {
  'F_Cu.gbr': 'Gerber_TopLayer.GTL',
  'B_Cu.gbr': 'Gerber_BottomLayer.GBL',
  'F_Mask.gbr': 'Gerber_TopSolderMaskLayer.GTS',
  'B_Mask.gbr': 'Gerber_BottomSolderMaskLayer.GBS',
  'F_Silkscreen.gbr': 'Gerber_TopSilkscreenLayer.GTO',
  'B_Silkscreen.gbr': 'Gerber_BottomSilkscreenLayer.GBO',
  'F_Paste.gbr': 'Gerber_TopPasteMaskLayer.GTP',
  'B_Paste.gbr': 'Gerber_BottomPasteMaskLayer.GBP',
  'Edge_Cuts.gbr': 'Gerber_BoardOutlineLayer.GKO',
}

export const jlcFabricationFilename = (name: string, text: string) => {
  const innerLayer = /^In(\d+)_Cu\.gbr$/.exec(name)?.[1]
  if (innerLayer) return `Gerber_InnerLayer${innerLayer}.G${innerLayer}`
  if (name.endsWith('.drl')) {
    const drillType = /^;[ \t]*#@![ \t]+TF\.FileFunction,(?:NonPlated|Plated),\d+,\d+,(NPTH|PTH)\r?$/m.exec(text)?.[1]
    if (drillType) return `Drill_${drillType}_Through.DRL`
  }
  return layerNames[name] ?? name
}
