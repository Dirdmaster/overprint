import { readArtwork, type Artwork } from './artwork'
import { solidPaintColor } from './paintColor'
import { renderDrawing } from './drawing'
import { renderVector } from './vectorArtwork'
import { renderText } from './artworkText'
import { renderAppearance } from './artworkAppearance'
export type ColorRole = 'fill' | 'stroke'
export type ArtworkColor = { role: ColorRole; color: string }
const geometry = 'path,rect,circle,ellipse,polygon,polyline,line'
const namedColors = new Map<string,string>()
let colorContext:CanvasRenderingContext2D | null | undefined
const normalize = (value:string | undefined) => {
  if (!value) return
  const direct = solidPaintColor(value)
  if (direct) return direct
  if (!/^[a-z]+$/i.test(value) || ['none','inherit','currentcolor','transparent'].includes(value.toLowerCase())) return
  const key=value.toLowerCase(), cached=namedColors.get(key)
  if(cached)return cached
  if (!CSS.supports('color',value)) return
  if(!colorContext){const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;colorContext=canvas.getContext('2d')}
  if(!colorContext)return
  colorContext.fillStyle=value
  const color=solidPaintColor(colorContext.fillStyle)
  if(color)namedColors.set(key,color)
  return color
}
const inherited = (node:Element, attribute:string, fallback:string):string => {
  for(let current:Element|null=node;current;current=current.parentElement) {
    const value=current.getAttribute(attribute)
    if(value && value !== 'inherit') {
      if(value === 'currentColor' && attribute === 'color')continue
      return value === 'currentColor' ? inherited(current,'color','#000000') : value
    }
  }
  return fallback
}
const painted = (doc:Document) => [...doc.querySelectorAll(geometry)].filter(node => !node.closest('mask,clipPath') && (!node.closest('defs') || !!node.closest('pattern')))
export const artworkColors = (item:Artwork):ArtworkColor[] => {
  const doc=new DOMParser().parseFromString(item.source,'image/svg+xml')
  const colors=new Map<string,ArtworkColor>()
  for(const node of painted(doc)) for(const role of ['fill','stroke'] as const) {
    if(role === 'fill' && node.localName === 'line')continue
    if(role === 'stroke' && parseFloat(inherited(node,'stroke-width','1')) === 0)continue
    const color=normalize(inherited(node,role,role === 'fill' ? '#000000' : 'none'))
    if(color)colors.set(`${role}:${color}`,{role,color})
  }
  for(const stop of doc.querySelectorAll('stop')) {
    const color=normalize(stop.getAttribute('stop-color') ?? '#000000')
    if(color)colors.set(`fill:${color}`,{role:'fill',color})
  }
  return [...colors.values()]
}
export const recolorArtworkRole = async (item:Artwork, role:ColorRole, from:string, to:string):Promise<Artwork> => {
  if(item.appearance) {
    const base = await recolorArtworkRole({...item,appearance:undefined,source:item.appearance.base},role,from,to)
    const colors = role === 'fill' ? item.appearance.colors.map(color => normalize(color) === from ? to : color) as [string,string] : item.appearance.colors
    const rendered=await renderAppearance({...item.appearance,base:base.source,colors})
    return {...item,...rendered}
  }
  const doc=new DOMParser().parseFromString(item.source,'image/svg+xml')
  const targets=painted(doc).filter(node => !(role === 'fill' && node.localName === 'line') && normalize(inherited(node,role,role === 'fill' ? '#000000' : 'none')) === from)
  const stops=role === 'fill' ? [...doc.querySelectorAll('stop')].filter(node => normalize(node.getAttribute('stop-color') ?? '#000000') === from) : []
  if(!targets.length && !stops.length)return item
  for(const node of targets)node.setAttribute(role,to)
  for(const node of stops)node.setAttribute('stop-color',to)
  let next:Artwork={...item, source:(await readArtwork(new File([new XMLSerializer().serializeToString(doc.documentElement)],'recolored.svg'))).source}
  if(item.text && role === 'fill' && normalize(item.text.color) === from) { const text={...item.text,color:to}; next={...next,text,source:renderText(text).source} }
  if(item.drawing && normalize(item.drawing[role as 'fill']) === from) {
    const drawing=item.drawing.type === 'shape' ? {...item.drawing,[role]:to} : role === 'fill' ? {...item.drawing,fill:to} : item.drawing
    next={...next,drawing}
    if(drawing.type === 'shape')next.source=renderDrawing(drawing).source
  }
  if(item.vector && normalize(item.vector[role]) === from) {const vector={...item.vector,[role]:to};next={...next,vector,source:renderVector(vector).source}}
  return next
}
