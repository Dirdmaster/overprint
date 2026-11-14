import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#ffd426"/></svg>'
const base={source,x:3,y:3,width:4,height:4,rotation:0,visible:true}
const artwork=[{...base,id:'folder',name:'Front group',kind:'folder',source:'',side:'front'},{...base,id:'child',name:'Front mark',parentId:'folder',side:'front'},{...base,id:'rear',name:'Back mark',side:'back'}]
const project={version:1,side:'front',silk:true,mask:'#202723',fabrication:false,board:{name:'Artboard test',bounds:{x:0,y:0,width:20,height:20},outline:'M0,0 L20,0 L20,20 L0,20 Z',holes:'',layers:{}},artwork}
const open=async(page:Page)=>{await page.goto('/');await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Choose project file').setInputFiles({name:'artboards.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.getByRole('button',{name:'Front mark',exact:true})).toBeVisible()}
const save=async(page:Page)=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await(await pending).path())!,'utf8'))}

test('Front and Back keep separate visible layer stacks and share one property inspector',async({page})=>{
 await open(page)
 const front=page.getByRole('region',{name:'Front artboard layers'}), back=page.getByRole('region',{name:'Back artboard layers'})
 await expect(front.getByRole('button',{name:'Front mark',exact:true})).toBeVisible()
 await expect(back.getByRole('button',{name:'Back mark',exact:true})).toBeVisible()
 await back.getByRole('button',{name:'Back mark',exact:true}).click()
 await expect(page.getByRole('button',{name:'Activate Back artboard'})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByLabel('Layer name',{exact:true})).toHaveValue('Back mark')
 await expect(page.getByLabel('Layer name',{exact:true})).toHaveCount(1)
 await expect(front.getByRole('button',{name:'Front mark',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Add layer',exact:true}).click()
 expect((await save(page)).artwork.find((i:any)=>i.name==='Layer 1').side).toBe('back')
 await page.getByRole('button',{name:'Collapse Front artboard',exact:true}).click()
 await expect(front.getByRole('button',{name:'Front mark',exact:true})).toHaveCount(0)
 await expect(back.getByRole('button',{name:'Back mark',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Expand Front artboard',exact:true}).click()
 await expect(front.getByRole('button',{name:'Front mark',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toHaveCount(1)
 await page.getByRole('button',{name:'Activate Front artboard'}).dblclick()
 await expect(page.locator('[data-board-side="back"]')).toHaveCount(0)
 await expect(back).toBeVisible()
 await page.getByRole('button',{name:'Both',exact:true}).click()
 await expect(page.locator('[data-board-side="back"]')).toBeVisible()
})

test('moving a folder to another artboard preserves descendants, geometry, history and saved project',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Front group',exact:true}).click()
 await page.getByRole('combobox',{name:'Move to',exact:true}).selectOption('artboard:back')
 let saved=await save(page)
 expect(saved.artwork.find((i:any)=>i.id==='folder')).toMatchObject({...artwork[0],side:'back'})
 expect(saved.artwork.find((i:any)=>i.id==='child')).toEqual({...artwork[1],side:'back'})
 await expect(page.getByRole('button',{name:'Activate Back artboard'})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 expect((await save(page)).artwork).toEqual(artwork)
 await expect(page.getByRole('button',{name:'Activate Front artboard'})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button',{name:'Redo',exact:true}).click()
 await page.keyboard.press('Control+s');await expect(page.getByRole('status')).toContainText('All changes saved')
 await page.reload();saved=await save(page)
 expect(saved.artwork.find((i:any)=>i.id==='child')).toEqual({...artwork[1],side:'back'})
})

test('drop artwork onto another artboard header without changing its physical frame',async({page})=>{
 await open(page)
 await page.getByRole('button',{name:'Front mark',exact:true}).dragTo(page.locator('[data-artboard-layers="back"] > header'))
 const saved=await save(page)
 expect(saved.artwork.find((i:any)=>i.id==='child')).toMatchObject({...base,id:'child',name:'Front mark',side:'back'})
 expect(saved.artwork.find((i:any)=>i.id==='child').parentId).toBeUndefined()
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 expect((await save(page)).artwork).toEqual(artwork)
})

test('artboard layer sections fit a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page)
 await expect(page.getByRole('button',{name:'Activate Front artboard'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Activate Back artboard'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('a locked child prevents moving its containing folder to another artboard',async({page})=>{
 await open(page)
 await page.getByRole('button',{name:'Lock Front mark',exact:true}).click()
 await page.getByRole('button',{name:'Front group',exact:true}).click()
 await expect(page.getByRole('combobox',{name:'Move to',exact:true}).getByRole('option',{name:'Back artboard',exact:true})).toHaveAttribute('disabled','')
 await expect(page.getByRole('button',{name:'Front group',exact:true})).toHaveAttribute('draggable','false')
 expect((await save(page)).artwork.find((i:any)=>i.id==='child')).toMatchObject({side:'front',locked:true})
})
