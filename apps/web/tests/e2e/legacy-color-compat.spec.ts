import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const project=JSON.parse(readFileSync(new URL('../fixtures/legacy-color-artwork.json',import.meta.url),'utf8'))
test('existing saved artwork recolors and reopens without exposing effect creation controls',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Open project',exact:true}).click();await page.getByLabel('Choose project file').setInputFiles({name:'existing.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await expect(page.getByRole('status')).toContainText('Project opened')
 await page.getByRole('button',{name:'Existing artwork',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click()
 const from=project.artwork[0].appearance.colors[0]
 await page.getByRole('button',{name:`Change fill ${from}`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fill color',exact:true});const hex=dialog.getByRole('textbox',{name:'Hex color',exact:true});await hex.fill('69c6ff');await hex.press('Enter');await dialog.getByRole('button',{name:'Apply color',exact:true}).click()
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click();const value=JSON.parse(readFileSync((await(await download).path())!,'utf8'))
 expect(value.artwork[0].appearance.kind).toBe(project.artwork[0].appearance.kind);expect(value.artwork[0].appearance.colors).toEqual(['#69c6ff',project.artwork[0].appearance.colors[1]])
 await page.keyboard.press('ControlOrMeta+s');await expect(page.getByRole('status')).toContainText('All changes saved');await page.reload();await page.getByRole('button',{name:'Existing artwork',exact:true}).click();await page.getByRole('tab',{name:'Color',exact:true}).click();await expect(page.getByRole('button',{name:'Change fill #69c6ff',exact:true})).toBeVisible()
})
