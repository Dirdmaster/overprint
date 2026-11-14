import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const ink = 'M3,3 L9,3 L9,9 L3,9 Z'
const source = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6 6"><rect width="6" height="6" fill="${fill}"/></svg>`
const project = {version:1,side:'front',silk:true,mask:'#202723',fabrication:false,
 board:{name:'Two-sided paint',bounds:{x:0,y:0,width:20,height:20},outline:'M0,0 L20,0 L20,20 L0,20 Z',holes:'',layers:{'front-silkscreen':[ink],'back-silkscreen':[ink]}},
 artwork:['front','back'].map(side=>({id:side,name:`${side} mark`,side,source:source(side==='front'?'#e63136':'#3586e8'),x:12,y:12,width:5,height:5,rotation:0,visible:true}))}
const open = async(page:Page)=>{
 await page.goto('/');await page.getByRole('button',{name:'Open project',exact:true}).click()
 await page.getByLabel('Choose project file').setInputFiles({name:'both.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))})
 await expect(page.locator('[data-board-side="back"]')).toBeVisible()
 await page.getByRole('button',{name:'Live paint (K)',exact:true}).click()
}
const point = async(page:Page,side:string,x:number,y:number)=>page.locator(`[data-board-side="${side}"] [data-board-coordinates]`).evaluate((g,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y}},[x,y])
const click=async(page:Page,side:string,x:number,y:number)=>{const p=await point(page,side,x,y);await page.mouse.click(p.x,p.y)}
const save=async(page:Page)=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await(await pending).path())!,'utf8'))}

test('both boards paint on the first click without choosing an active side',async({page})=>{
 await open(page)
 await click(page,'back',14,14)
 let saved=await save(page)
 expect(saved.artwork.find((i:any)=>i.id==='back').source).toContain('#ffd426')
 expect(saved.artwork.find((i:any)=>i.id==='front').source).toContain('#e63136')
 await click(page,'front',14,14)
 saved=await save(page)
 expect(saved.artwork.find((i:any)=>i.id==='front').source).toContain('#ffd426')
 await page.keyboard.press('Control+s');await expect(page.getByRole('status')).toContainText('All changes saved')
 await page.reload();saved=await save(page)
 expect(saved.artwork.every((i:any)=>i.source.includes('#ffd426'))).toBe(true)
})

test('one drag paints identical native regions across both boards with one undo',async({page})=>{
 await open(page)
 const front=await point(page,'front',6,6), back=await point(page,'back',6,6)
 await page.mouse.move(front.x,front.y);await page.mouse.down();await page.mouse.move(back.x,back.y,{steps:50});await page.mouse.up()
 const saved=await save(page)
 for(const side of ['front','back']) expect(saved.artwork.find((i:any)=>i.side===side&&i.nativeSilk)?.nativeSilk.colors[ink]).toBe('#ffd426')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 expect((await save(page)).artwork).toEqual(project.artwork)
 await page.getByRole('button',{name:'Redo',exact:true}).click()
 expect((await save(page)).artwork).toEqual(saved.artwork)
})

test('hover, color cycling and eyedropper work on either board without duplicate keyboard actions',async({page})=>{
 await open(page)
 const back=await point(page,'back',14,14), front=await point(page,'front',14,14)
 await page.mouse.move(back.x,back.y)
 await expect(page.locator('[data-board-side="back"] [data-artwork-paint-preview] > *')).toHaveCount(2)
 await expect(page.locator('[data-board-side="front"] [data-artwork-paint-preview] > *')).toHaveCount(0)
 await page.locator('svg[role="img"]').focus();await page.keyboard.press('ArrowRight')
 await expect(page.getByRole('button',{name:'Fill color: Pink',exact:true})).toBeVisible()
 await page.keyboard.press('i')
 await expect(page.getByRole('button',{name:'Pick ink color (I)'})).toHaveAttribute('aria-pressed','true')
 await page.mouse.click(back.x,back.y)
 await expect(page.getByRole('button',{name:'Fill color: Blue',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Pick ink color (I)'})).toHaveAttribute('aria-pressed','false')
 expect((await save(page)).artwork).toEqual(project.artwork)
 await page.mouse.move(front.x,front.y)
 await expect(page.locator('[data-board-side="front"] [data-artwork-paint-preview] > *')).toHaveCount(2)
 await expect(page.locator('[data-board-side="back"] [data-artwork-paint-preview] > *')).toHaveCount(0)
 await page.mouse.down(); await page.mouse.move(back.x,back.y,{steps:30})
 await page.keyboard.press('Escape'); await page.mouse.up()
 await expect(page.locator('[data-artwork-paint-preview] > *')).toHaveCount(0)
})
