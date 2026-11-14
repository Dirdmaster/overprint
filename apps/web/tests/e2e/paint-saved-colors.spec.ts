import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const project={version:1,side:'front',silk:false,mask:'#202723',fabrication:false,palette:[{name:'Acid',color:'#c6f36b'}],board:{name:'Saved paint colors',bounds:{x:0,y:0,width:40,height:30},outline:'M0 0L40 0L40 30L0 30Z',holes:'',layers:{}},artwork:[{id:'mark',name:'Mark',side:'front',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>',x:10,y:10,width:10,height:10,rotation:0,visible:true}]}
const open=async(page:Page)=>{await page.goto('/');await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Choose project file').setInputFiles({name:'saved-colors.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.getByRole('status')).toContainText('Project opened');await page.getByRole('button',{name:'Live paint (K)',exact:true}).click()}
const save=async(page:Page)=>{const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await(await download).path())!,'utf8'))}
const customColor=async(page:Page,color:string)=>{await page.getByRole('button',{name:/^Fill color:/}).click();const hex=page.getByRole('textbox',{name:'Hex color',exact:true});await hex.fill(color.slice(1));await hex.press('Enter');await page.keyboard.press('Escape')}
const saveColor=async(page:Page,name:string)=>{await page.getByRole('button',{name:'Save current paint color',exact:true}).click();await page.getByRole('textbox',{name:'Saved color name',exact:true}).fill(name);await page.getByRole('button',{name:'Save color',exact:true}).click()}
test('saved swatches choose the brush color and paint actual artwork',async({page})=>{
 await open(page)
 await expect(page.getByRole('group',{name:'Saved color swatches',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Paint Acid',exact:true}).click();await expect(page.getByRole('button',{name:'Fill color: Acid',exact:true})).toBeVisible()
 const point=await page.locator('[data-board-side="front"] [data-board-coordinates]').evaluate(g=>{const p=new DOMPoint(15,15).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y}})
 await page.mouse.click(point.x,point.y);expect((await save(page)).artwork[0].source).toContain('#c6f36b')
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).artwork).toEqual(project.artwork)
})
test('current paint color saves, renames and deletes as a project asset without changing artwork',async({page},testInfo)=>{
 await open(page);await customColor(page,'#aabbdd');await saveColor(page,'Sky')
 await expect(page.getByRole('button',{name:'Paint Sky',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Save current paint color',exact:true})).toBeDisabled()
 const initial=await save(page);expect(initial.palette).toEqual([...project.palette,{name:'Sky',color:'#aabbdd'}]);expect(initial.artwork).toEqual(project.artwork)
 await page.getByRole('button',{name:'Manage saved colors',exact:true}).click();const manager=page.getByRole('dialog',{name:'Manage saved colors',exact:true});await manager.getByRole('button',{name:'Rename saved color Sky',exact:true}).click();await manager.getByRole('textbox',{name:'Saved color name',exact:true}).fill('Cloud');await manager.getByRole('button',{name:'Confirm color name',exact:true}).click();await page.keyboard.press('Escape')
 await expect(page.getByRole('button',{name:'Fill color: Cloud',exact:true})).toBeVisible();await page.screenshot({path:testInfo.outputPath('saved-paint-colors.png')})
 await page.getByRole('button',{name:'Manage saved colors',exact:true}).click();await manager.getByRole('button',{name:'Delete saved color Cloud',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Paint Cloud',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Paint Cloud',exact:true})).toBeVisible();expect((await save(page)).artwork).toEqual(project.artwork)
 await page.keyboard.press('ControlOrMeta+s');await expect(page.getByRole('status')).toContainText('All changes saved');await page.reload();await page.getByRole('button',{name:'Live paint (K)',exact:true}).click();await expect(page.getByRole('button',{name:'Paint Cloud',exact:true})).toBeVisible()
})
test('mobile saved colors are visible without expanding settings and save popover fits the viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await open(page)
 await expect(page.getByRole('button',{name:'More paint settings',exact:true})).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('button',{name:'Paint Acid',exact:true})).toBeVisible()
 await customColor(page,'#e1a0bc');await page.getByRole('button',{name:'Save current paint color',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Save paint color',exact:true});await dialog.getByRole('textbox',{name:'Saved color name',exact:true}).pressSequentially('Pink')
 await expect(page.getByRole('button',{name:'Live paint (K)',exact:true})).toHaveAttribute('aria-pressed','true');const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390)
 await page.screenshot({path:testInfo.outputPath('save-paint-color-mobile.png')});await dialog.getByRole('button',{name:'Save color',exact:true}).click();await expect(page.getByRole('button',{name:'Paint Pink',exact:true})).toHaveAttribute('aria-pressed','true')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
