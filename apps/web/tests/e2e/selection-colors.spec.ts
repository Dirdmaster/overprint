import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { demoBoard } from '../fixtures/demoBoard'
const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><g fill="red" stroke="#ff0000" stroke-width="0.4"><path d="M0 0H20L0 10Z"/></g></svg>'
const item={id:'mark',name:'Red mark',side:'front',source,x:10,y:10,width:20,height:10,rotation:20,visible:true}
const project={version:1,board:{name:'Color board',bounds:{x:0,y:0,width:60,height:40},outline:'M0 0L60 0L60 40L0 40Z',holes:'',layers:{}},artwork:[item,{...item,id:'back-mark',name:'Rear mark',side:'back',visible:false}],palette:[{name:'Brand blue',color:'#2468ef'}],side:'front',silk:false,mask:'#202723',fabrication:false}
const open=async(page:Page,value:unknown=project)=>{
 await page.goto('/');await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Choose project file').setInputFiles({name:'colors.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await expect(page.getByRole('status')).toContainText('Project opened')
}
const saved=async(page:Page)=>{const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await(await download).path())!,'utf8'))}
const choose=async(page:Page,role:'fill'|'stroke',from:string,color:string)=>{
 await page.getByRole('button',{name:`Change ${role} ${from}`,exact:true}).click()
 const dialog=page.getByRole('dialog',{name:role === 'fill' ? 'Fill color' : 'Stroke color',exact:true})
 const hex=dialog.getByRole('textbox',{name:'Hex color',exact:true});await hex.fill(color.slice(1));await hex.press('Enter');await dialog.getByRole('button',{name:'Apply color',exact:true}).click()
}
test('selected fill and stroke edit independently, preserve geometry and leave the other artboard unchanged',async({page},testInfo)=>{
 await open(page);await page.getByRole('button',{name:'Red mark',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click()
 await expect(page.getByRole('button',{name:'Change fill #ff0000',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Change stroke #ff0000',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:/Gradient fill|Stripes fill|Dots fill/})).toHaveCount(0)
 await choose(page,'fill','#ff0000','#2468ef')
 const colored=await saved(page)
 expect(colored.artwork[0].source).toContain('fill="#2468ef"');expect(colored.artwork[0].source).toContain('stroke="#ff0000"')
 expect(colored.artwork[1]).toEqual((await saved(page)).artwork[1]);expect(colored.artwork[1].source).toBe(source)
 for(const key of ['x','y','width','height','rotation'])expect(colored.artwork[0][key]).toBe(item[key as keyof typeof item])
 await choose(page,'stroke','#ff0000','#4ba543');expect((await saved(page)).artwork[0].source).toContain('stroke="#4ba543"')
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Change stroke #ff0000',exact:true})).toBeVisible()
 await page.screenshot({path:testInfo.outputPath('selection-colors.png')})
 await page.keyboard.press('ControlOrMeta+s');await expect(page.getByRole('status')).toContainText('All changes saved');await page.reload();await page.getByRole('button',{name:'Red mark',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click();await expect(page.getByRole('button',{name:'Change fill #2468ef',exact:true})).toBeVisible()
})
test('color picker cancellation and saved colors preserve artwork and restore focus',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Red mark',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click()
 const trigger=page.getByRole('button',{name:'Change fill #ff0000',exact:true});await trigger.click();await page.getByRole('dialog',{name:'Fill color',exact:true}).getByRole('button',{name:'Brand blue',exact:true}).click();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();expect((await saved(page)).artwork[0].source).toBe(source)
 await page.getByRole('button',{name:'Live paint (K)',exact:true}).click();await page.getByRole('button',{name:/^Fill color:/}).click();const paintHex=page.getByRole('textbox',{name:'Hex color',exact:true});await paintHex.fill('4ba543');await paintHex.press('Enter');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Save current paint color',exact:true}).click();await page.getByRole('textbox',{name:'Saved color name',exact:true}).fill('Leaf');await page.getByRole('button',{name:'Save color',exact:true}).click()
 await trigger.click();const dialog=page.getByRole('dialog',{name:'Fill color',exact:true});await dialog.getByRole('button',{name:'Leaf',exact:true}).click();await dialog.getByRole('button',{name:'Apply color',exact:true}).click();expect((await saved(page)).artwork[0].source).toContain('fill="#4ba543"')
})
test('changing a drawn shape color retains editable shape metadata and one-step undo',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Import PCB',exact:true}).click();await page.getByLabel('Choose board export').setInputFiles(demoBoard)
 await page.getByRole('button',{name:'Draw rectangle',exact:true}).click()
 const points=await page.locator('[data-board-side="front"] [data-board-coordinates]').evaluate(g=>[new DOMPoint(20,40),new DOMPoint(35,50)].map(p=>{const s=p.matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return{x:s.x,y:s.y}}))
 await page.mouse.move(points[0]!.x,points[0]!.y);await page.mouse.down();await page.mouse.move(points[1]!.x,points[1]!.y,{steps:5});await page.mouse.up();const before=await saved(page)
 await page.getByRole('tab',{name:'Color',exact:true}).click();await choose(page,'fill','#ffd426','#2468ef');const after=await saved(page)
 expect(after.artwork[0].drawing).toEqual({...before.artwork[0].drawing,fill:'#2468ef'});expect(after.artwork[0].width).toBe(before.artwork[0].width)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).artwork).toEqual(before.artwork)
})
test('native silkscreen colors remain scoped to their artboard and preserve individually painted paths',async({page})=>{
 const path='M0 0L4 0L4 4Z',second='M8 0L12 0L12 4Z'
 await open(page,{...project,silk:true,board:{...project.board,layers:{'front-silkscreen':[path,second],'back-silkscreen':[path]}},artwork:[{id:'kicad:front',name:'KiCad silkscreen',kind:'layer',nativeSilk:{colors:{[path]:'#ff0000'}},side:'front',source:'',visible:true,x:0,y:0,width:1,height:1,rotation:0}]})
 await page.getByRole('button',{name:'KiCad silkscreen',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click();await choose(page,'fill','#f4f1e8','#2468ef');const value=await saved(page)
 expect(value.artwork[0].nativeSilk).toEqual({baseColor:'#2468ef',colors:{[path]:'#ff0000'}});expect(value.artwork.some((i:any)=>i.side === 'back')).toBe(false)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).artwork[0].nativeSilk.colors[path]).toBe('#ff0000')
})
test('mobile Color has normal color editing and a direct Paint shortcut without effects',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await open(page);await page.getByRole('tab',{name:'Color',exact:true}).click();await expect(page.getByText('Select artwork to edit its colors, or paint directly on the board.',{exact:true})).toBeVisible()
 const paint=page.getByRole('button',{name:/Paint directly on the board/});await paint.click();await expect(page.getByRole('button',{name:'Live paint (K)',exact:true})).toHaveAttribute('aria-pressed','true')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:testInfo.outputPath('color-mobile.png'),fullPage:true})
})
