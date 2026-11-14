import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { demoBoard } from '../fixtures/demoBoard'
const open = async(page:Page) => { await page.setViewportSize({width:1440,height:960});await page.goto('/');await page.getByRole('button',{name:'Import PCB',exact:true}).click();await page.getByLabel('Choose board export').setInputFiles(demoBoard);await expect(page.locator('[data-board-side="front"]')).toBeVisible();await page.getByRole('img',{name:'Demo board front board preview',exact:true}).focus() }
const point = (page:Page,x:number,y:number,side='front') => page.locator(`[data-board-side="${side}"] [data-board-coordinates]`).evaluate((g,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y}},[x,y])
const click = async(page:Page,x:number,y:number,side='front') => {const p=await point(page,x,y,side);await page.mouse.click(p.x,p.y)}
const drag = async(page:Page,x:number,y:number,xx:number,yy:number,side='front') => {const p=await point(page,x,y,side),q=await point(page,xx,yy,side);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:8});await page.mouse.up()}
const save = async(page:Page) => {const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();return JSON.parse(readFileSync((await(await pending).path())!,'utf8'))}

test('groups related tools, remembers the last tool and supports hold, right click and keyboard access',async({page})=>{
 await open(page)
 const toolbar=page.getByRole('toolbar',{name:'Canvas tools'})
 await expect(toolbar.getByRole('group')).toHaveCount(6)
 await expect(page.getByRole('button',{name:'Draw ellipse',exact:true})).toHaveCount(0)
 await toolbar.getByRole('button',{name:'More shape tools',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'More shape tools',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Draw ellipse',exact:true}).click()
 await expect(toolbar.getByRole('button',{name:'Draw ellipse',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.keyboard.press('v');await page.keyboard.press('m')
 await expect(toolbar.getByRole('button',{name:'Draw rectangle',exact:true})).toHaveAttribute('aria-pressed','true')
 await toolbar.getByRole('button',{name:'Draw rectangle',exact:true}).click({modifiers:['Alt']})
 await expect(toolbar.getByRole('button',{name:'Draw rounded rectangle',exact:true})).toHaveAttribute('aria-pressed','true')
 await toolbar.getByRole('button',{name:'Draw rounded rectangle',exact:true}).click({modifiers:['Alt']})
 await expect(toolbar.getByRole('button',{name:'Draw ellipse',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.keyboard.press('m')
 const rect=toolbar.getByRole('button',{name:'Draw rectangle',exact:true}),box=(await rect.boundingBox())!
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up()
 await expect(page.getByRole('dialog',{name:'More shape tools',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await rect.click({button:'right'})
 await expect(page.getByRole('dialog',{name:'More shape tools',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await rect.focus();await page.keyboard.press('ArrowRight')
 await expect(page.getByRole('dialog',{name:'More shape tools',exact:true})).toBeVisible()
 await page.screenshot({path:'test-results/grouped-tools-desktop.png'})
 await page.keyboard.press('Escape');await page.keyboard.press('l');await page.keyboard.press('h');await page.keyboard.press('Space');await page.keyboard.up('Space')
 await expect(toolbar.getByRole('button',{name:'Draw ellipse',exact:true})).toBeVisible()
})

test('M draws repeated shapes, Shift constrains proportions and Option draws from the center on both sides',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Select (V)',exact:true}).click();await page.keyboard.press('m')
 for(const side of ['front','back']){
  await page.keyboard.down('Alt');await page.keyboard.down('Shift');await drag(page,35,65,45,70,side);await page.keyboard.up('Shift');await page.keyboard.up('Alt')
  await expect(page.getByRole('button',{name:'Draw rectangle',exact:true})).toHaveAttribute('aria-pressed','true')
 }
 const project=await save(page);expect(project.artwork).toHaveLength(2)
 for(const item of project.artwork){expect(item.width).toBeCloseTo(20,1);expect(item.height).toBeCloseTo(20,1);expect(item.x).toBeCloseTo(25,1);expect(item.y).toBeCloseTo(55,1)}
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).artwork).toHaveLength(1)
})

test('marquee selects artwork, Shift constrains a selection drag and clicks clear the selection',async({page})=>{
 await open(page);await page.keyboard.press('m');await drag(page,20,45,28,51);await drag(page,40,60,48,66);await page.keyboard.press('v')
 const p=await point(page,18,42),q=await point(page,50,70);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:8})
 await expect(page.locator('[data-selection-marquee]')).toBeVisible();await page.mouse.up()
 await expect(page.locator('[data-artwork-layer] > rect[stroke="#4f87ff"]')).toHaveCount(2)
 const before=await save(page);await page.keyboard.down('Shift');await drag(page,24,48,31,51);await page.keyboard.up('Shift')
 const after=await save(page);for(let i=0;i<2;i++){expect(after.artwork[i].x-before.artwork[i].x).toBeCloseTo(7,1);expect(after.artwork[i].y).toBeCloseTo(before.artwork[i].y,2)}
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await save(page)).artwork).toEqual(before.artwork)
 await click(page,20,90);await expect(page.locator('[data-artwork-layer] > rect[stroke="#4f87ff"]')).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'Pathfinder',exact:true})).toHaveCount(0)
})

test('Pen previews segments, Space preserves the draft, first point closes and Enter finishes an open path',async({page})=>{
 await open(page);await page.keyboard.press('p');await click(page,25,45);await click(page,35,45)
 await expect(page.locator('[data-pen-preview]')).toHaveCount(1)
 await page.keyboard.down('Space');await page.keyboard.up('Space');await expect(page.locator('[data-pen-preview]')).toHaveCount(1)
 await click(page,30,55);await click(page,25,45)
 const closed=await save(page);expect(closed.artwork[0].vector.contours[0].closed).toBe(true)
 await expect(page.getByRole('button',{name:'Pen (P)',exact:true})).toHaveAttribute('aria-pressed','true')
 await click(page,25,70);await click(page,35,70);await page.keyboard.press('Backspace');await click(page,40,75);await page.keyboard.press('Enter')
 const openPath=await save(page);expect(openPath.artwork).toHaveLength(2);expect(openPath.artwork[1].vector.contours[0].closed).toBe(false);expect(openPath.artwork[1].vector.contours[0].points).toHaveLength(2)
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Select (V)',exact:true})).toHaveAttribute('aria-pressed','true')
})

test('A edits vector nodes, keyboard nudge is undoable and V restores object selection',async({page})=>{
 await open(page);await page.keyboard.press('p');await click(page,25,45);await click(page,35,45);await click(page,30,55);await click(page,25,45)
 await page.keyboard.press('a');await expect(page.getByRole('button',{name:'Direct selection (A)',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-vector-node]')).toHaveCount(3)
 const before=await save(page);const node=page.locator('[data-vector-node]').first();await node.focus();await page.keyboard.press('ArrowRight')
 expect((await save(page)).artwork[0].source).not.toBe(before.artwork[0].source)
 await page.keyboard.press('ControlOrMeta+z');expect((await save(page)).artwork).toEqual(before.artwork)
 await page.keyboard.press('v');await expect(page.locator('[data-vector-node]')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Select (V)',exact:true})).toHaveAttribute('aria-pressed','true')
})

test('tool shortcuts do not hijack inspector inputs and grouped flyouts fit mobile',async({page})=>{
 await open(page);await page.keyboard.press('m');await drag(page,20,40,30,50)
 const name=page.getByRole('textbox',{name:'Layer name',exact:true});await name.fill('m l p a h t v');await name.press('Tab')
 await expect(page.getByRole('button',{name:'Draw rectangle',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'More shape tools',exact:true}).click();await expect(page.getByRole('dialog',{name:'More shape tools',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
 await page.screenshot({path:'test-results/grouped-tools-mobile.png',fullPage:true})
})
