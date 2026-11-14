import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { demoBoard } from '../fixtures/demoBoard'
import { routeGeist } from '../fixtures/googleFontFixture'
const open = async (page: Page) => { await page.setViewportSize({ width:1440,height:960 }); await page.goto('/');await page.getByRole('button',{name:'Import PCB',exact:true}).click();await page.getByLabel('Choose board export').setInputFiles(demoBoard) }
const save = async (page: Page) => { const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await (await pending).path())!,'utf8')) }
const position = (page: Page,x:number,y:number,side='front') => page.locator(`[data-board-side="${side}"] [data-board-coordinates]`).evaluate((g,[x,y])=>{ const p=new DOMPoint(x,y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y} },[x,y])
const draw = async (page: Page,tool:string,x:number,y:number,w:number,h:number) => { if(!(await page.getByRole('button',{name:tool,exact:true}).isVisible())) await page.getByRole('button',{name:'More shape tools',exact:true}).click();await page.getByRole('button',{name:tool,exact:true}).click();const start=await position(page,x,y),end=await position(page,x+w,y+h);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up() }
const section = async (page: Page, tab: string, name: string) => {
 await page.getByRole('tab', { name: tab, exact: true }).click()
 return page.getByRole('region', { name, exact: true })
}

test('draws, subtracts a hole and edits vector nodes with one-step undo',async({page})=>{
 await open(page);await draw(page,'Draw rectangle',20,40,20,20);await draw(page,'Draw ellipse',25,45,10,10)
 await page.getByRole('button',{name:'Rectangle',exact:true}).click();await page.getByRole('button',{name:'Ellipse',exact:true}).click({modifiers:['Shift']})
 await page.getByRole('button',{name:'Subtract top',exact:true}).click()
 await expect(page.getByRole('button',{name:'subtract result',exact:true})).toBeVisible()
 const before=await save(page);expect(before.artwork).toHaveLength(1);expect(before.artwork[0].vector.contours).toHaveLength(2)
 await page.getByRole('checkbox',{name:'Edit vector nodes',exact:true}).check()
 const input=page.getByRole('spinbutton',{name:'Vector node X',exact:true});await input.fill('1');await input.press('Tab')
 const next=await save(page);expect(next.artwork[0].source).not.toBe(before.artwork[0].source)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).artwork[0].source).toBe(before.artwork[0].source)
})

test('pen paths and Google Fonts text work on the shared rear canvas',async({page})=>{
 await routeGeist(page);await open(page);await page.getByRole('button',{name:'Pen (P)',exact:true}).click()
 for(const [x,y]of [[25,45],[35,45],[30,55]]){const p=await position(page,x!,y!,'back');await page.mouse.click(p.x,p.y)}
 const first=await position(page,25,45,'back');await page.mouse.click(first.x,first.y);const pen=await save(page);expect(pen.artwork[0].side).toBe('back');expect(pen.artwork[0].vector.contours[0].closed).toBe(true)
 await page.getByRole('button',{name:'Draw text',exact:true}).click();const p=await position(page,25,65,'back');await page.mouse.click(p.x,p.y)
 await expect(page.getByRole('combobox',{name:'Font family',exact:true})).toContainText('Geist')
 await page.getByRole('combobox',{name:'Font style',exact:true}).focus()
 await page.getByRole('combobox',{name:'Font style',exact:true}).selectOption('700')
 await expect.poll(async()=> (await save(page)).artwork.at(-1).drawing.google.variant).toBe('700')
 const project=await save(page);expect(project.artwork.at(-1).drawing.font).toBe('google-fonts-v1');expect(project.artwork.at(-1).drawing.weight).toBe(700);expect(project.artwork.at(-1).source).toContain('<path')
})

test('named palettes replace hidden rear artwork, undo and persist a selected fill color',async({page})=>{
 await open(page);await draw(page,'Draw rectangle',20,40,15,10);const project=await save(page)
 project.artwork[0].name='Front swatch';project.artwork.push({...structuredClone(project.artwork[0]),id:'rear-swatch',name:'Rear swatch',side:'back',visible:false})
 await page.getByLabel('Choose project file').setInputFiles({name:'palette.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))})
 await page.getByRole('button',{name:'Live paint (K)',exact:true}).click();await page.getByRole('button',{name:'Save current paint color',exact:true}).click();await page.getByRole('textbox',{name:'Saved color name',exact:true}).fill('Accent');await page.getByRole('button',{name:'Save color',exact:true}).click();const panel=await section(page,'Color','Color tools');await panel.getByRole('button',{name:'Replace project color',exact:true}).click();await page.getByRole('button',{name:'Replace across both artboards',exact:true}).click();await page.getByRole('button',{name:'Close color replacement',exact:true}).click()
 const replaced=await save(page);expect(replaced.artwork.every((i:any)=>i.drawing.fill==='#e63136')).toBe(true);expect(replaced.palette[0].color).toBe('#e63136')
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).palette[0].color).toBe('#ffd426')
 await page.getByRole('tab',{name:'Layers',exact:true}).click();await page.getByRole('button',{name:'Front swatch',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click();await panel.getByRole('button',{name:'Change fill #ffd426',exact:true}).click();const picker=page.getByRole('dialog',{name:'Fill color',exact:true});await picker.getByRole('textbox',{name:'Hex color',exact:true}).fill('2468ef');await picker.getByRole('textbox',{name:'Hex color',exact:true}).press('Enter');await picker.getByRole('button',{name:'Apply color',exact:true}).click()
 await expect.poll(async()=> (await save(page)).artwork[0].drawing.fill).toBe('#2468ef')
 const colored=await save(page);expect(colored.artwork[1].drawing.fill).toBe('#ffd426');await page.keyboard.press('ControlOrMeta+s');await expect(page.getByRole('status')).toContainText('All changes saved');await page.reload();expect((await save(page)).artwork[0].drawing.fill).toBe('#2468ef')
})

test('repetition previews, cancels, places on a pad anchor and undoes as one operation',async({page})=>{
 await open(page);await draw(page,'Draw rectangle',20,40,10,5)
 const panel=await section(page,'Layout','Layout tools');await panel.getByRole('button',{name:'Center selection on anchor',exact:true}).click()
 const centered=await save(page);expect(centered.artwork[0].x+centered.artwork[0].width/2).toBeCloseTo(38)
 await panel.getByRole('button',{name:'Preview repeat',exact:true}).click();await expect(page.locator('[data-repeat-preview]')).toHaveCount(2)
 await panel.getByRole('button',{name:'Cancel preview',exact:true}).click();await expect(page.locator('[data-repeat-preview]')).toHaveCount(0);expect((await save(page)).artwork).toHaveLength(1)
 await panel.getByRole('button',{name:'Preview repeat',exact:true}).click();await panel.getByRole('button',{name:'Apply repeat',exact:true}).click();expect((await save(page)).artwork).toHaveLength(3)
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).artwork).toHaveLength(1)
})

test('print findings identify thin ink and pad overlap, focus geometry and download a sourced review',async({page})=>{
 await open(page);const project=await save(page)
 project.artwork=[{id:'thin',name:'Thin ink',side:'front',x:13,y:23,width:.1,height:5,rotation:0,visible:true,source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 .1 5"><path d="M0 0H.1V5H0Z" fill="#ffd426"/></svg>'}]
 await page.getByLabel('Choose project file').setInputFiles({name:'review.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))})
 const panel=await section(page,'Board','Print checks');await panel.getByRole('button',{name:'Run print checks',exact:true}).click()
 await expect(panel.getByRole('button',{name:/Review finding .*pad-clearance/})).toBeVisible();await expect(panel.getByRole('button',{name:/Review finding .*thin-feature/})).toBeVisible()
 await panel.getByRole('button',{name:/Review finding .*pad-clearance/}).click();await expect(page.locator('[data-print-finding]')).not.toHaveCount(0)
 const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:'Download review',exact:true}).click();const report=JSON.parse(readFileSync((await(await downloaded).path())!,'utf8'));expect(report.profile.minimumLine).toBe(.15);expect(report.profile.source).toContain('jlcpcb.com');expect(report.findings.some((f:any)=>f.code==='thin-feature')).toBe(true)
})

test('PCB refresh previews and cancels safely, then restores the previous saved revision',async({page})=>{
 await open(page);await draw(page,'Draw rectangle',20,40,10,5);const before=await save(page)
 const files=unzipSync(demoBoard.buffer),manifest=JSON.parse(strFromU8(files['manifest.json']!)),geometry=JSON.parse(strFromU8(files['geometry.json']!));manifest.board.boundsMm.width=66;manifest.board.name='Demo updated';geometry.outlines[0].outer=[[10,20],[76,20],[76,120],[10,120]];files['manifest.json']=strToU8(JSON.stringify(manifest));files['geometry.json']=strToU8(JSON.stringify(geometry));const update={name:'update.overprint-board',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))}
 const panel=await section(page,'Board','PCB updates');await page.getByLabel('Choose PCB update').setInputFiles(update)
 const review=page.getByRole('dialog',{name:'Review PCB update',exact:true});await expect(review).toBeVisible();await review.getByRole('button',{name:'Cancel update',exact:true}).click();expect((await save(page)).board.bounds.width).toBe(56)
 await page.getByLabel('Choose PCB update').setInputFiles(update);await review.getByRole('button',{name:'Save revision and apply',exact:true}).click();await expect(review).not.toBeVisible();const after=await save(page);expect(after.board.bounds.width).toBe(66);expect(after.artwork).toEqual(before.artwork)
 await panel.getByRole('button',{name:/Restore Revision: Demo board before PCB refresh/}).click();await expect.poll(async()=> (await save(page)).board.bounds.width).toBe(56);expect((await save(page)).artwork).toEqual(before.artwork)
})
