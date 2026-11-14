import { computed, ref } from 'vue'
import { useArtwork } from './useArtwork'
import { useComposition } from '../project/useComposition'
import { artworkColors, recolorArtworkRole, type ArtworkColor } from '../../utils/artworkColors'
import { isNativeSilk, nativeSilkId, nativeSilkInks, nativeSilkSettings } from '../../utils/nativeSilk'
import { assertProjectSize } from '../../utils/project'
import { normalizeHex } from '../../utils/paintColor'
import { isArtworkLocked, type Artwork } from '../../utils/artwork'
export const useSelectionColors = (enabled = ref(true)) => {
  const cache = new Map<string,{source:string;colors:ArtworkColor[]}>()
  const a=useArtwork(), c=useComposition()
  const error=ref(''),busy=ref(false)
  const nativeSide=computed(() => isNativeSilk(a.selection.value) ? a.selection.value!.slice(6) : undefined)
  const selected=a.selectedArtwork
  const name=computed(() => nativeSide.value ? `${nativeSide.value === 'front' ? 'Front' : 'Back'} KiCad silkscreen` : selected.value.length === 1 ? selected.value[0]!.name : selected.value.length ? `${selected.value.length} selected graphics` : '')
  const inks=computed(() => nativeSide.value ? nativeSilkInks(c.board.value?.layers[`${nativeSide.value}-silkscreen`] ?? [],a.items.value,nativeSide.value,'#f4f1e8') : [])
  const rows=computed(() => {
    if(!enabled.value)return []
    const selectedIds=new Set(selected.value.map(item=>item.id))
    for(const id of cache.keys())if(!selectedIds.has(id))cache.delete(id)
    const found=new Map<string,ArtworkColor>()
    for(const item of selected.value) {
      let value=cache.get(item.id)
      if(value?.source !== item.source){value={source:item.source,colors:artworkColors(item)};cache.set(item.id,value)}
      for(const entry of value!.colors)found.set(`${entry.role}:${entry.color}`,entry)
    }
    for(const ink of inks.value)found.set(`fill:${ink.color.toLowerCase()}`,{role:'fill',color:ink.color.toLowerCase()})
    return [...found.values()]
  })
  const editable=computed(() => nativeSide.value ? !isArtworkLocked(a.items.value,a.items.value.find(item => item.side === nativeSide.value && item.nativeSilk)?.id ?? nativeSilkId(nativeSide.value)) : selected.value.length > 0 && selected.value.every(item => !item.library && !item.gold && a.canPatch(item.id,{source:item.source})))
  const apply=async (entry:ArtworkColor,color:string) => {
    if(busy.value || !editable.value || color.toLowerCase() === entry.color.toLowerCase())return
    const normalized=normalizeHex(color)
    if(!normalized){error.value='Choose a valid color.';return}
    color=normalized
    busy.value=true;error.value=''
    try {
      if(nativeSide.value) {
        const side=nativeSide.value, settings=nativeSilkSettings(a.items.value,side)
        const base=settings?.baseColor ?? '#f4f1e8'
        const nativeSilk={...settings,baseColor:base.toLowerCase() === entry.color.toLowerCase() ? color : settings?.baseColor,colors:Object.fromEntries(Object.entries(settings?.colors ?? {}).map(([path,value]) => [path,value.toLowerCase() === entry.color.toLowerCase() ? color : value]))}
        const existing=a.items.value.find(item => item.side === side && item.nativeSilk)
        a.checkpoint()
        a.items.value=existing ? a.items.value.map(item => item === existing ? {...item,nativeSilk} : item) : [...a.items.value,{id:nativeSilkId(side),name:'KiCad silkscreen',kind:'layer',nativeSilk,side,source:'',visible:true,x:0,y:0,width:1,height:1,rotation:0}]
      } else {
        const original=a.items.value, ids=selected.value.map(item => item.id)
        const next=await Promise.all(selected.value.map(item => recolorArtworkRole(item,entry.role,entry.color,color)))
        if(a.items.value !== original || selected.value.map(item => item.id).join() !== ids.join())throw new Error('The selection changed. Pick the color again.')
        const changes=next.flatMap(item => item.source === original.find(value => value.id === item.id)?.source ? [] : [{id:item.id,patch:item as Partial<Artwork>}])
        if(changes.some(change => !a.canPatch(change.id,change.patch)))throw new Error('Unlock and detach the selected artwork first.')
        if(changes.length){
          const byId=new Map(changes.map(change=>[change.id,change.patch]))
          assertProjectSize(JSON.stringify({board:c.board.value,artwork:original.map(item=>({...item,...byId.get(item.id)}))}))
          a.checkpoint();a.patchItems(changes)
        }
      }
    } catch(cause){error.value=cause instanceof Error ? cause.message : 'Could not change this color.'} finally {busy.value=false}
  }
  return {selected,name,rows,editable,busy,error,apply}
}
