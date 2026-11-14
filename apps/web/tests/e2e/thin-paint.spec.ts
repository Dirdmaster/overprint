import { test, expect } from '@playwright/test'
const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 0.35"><path d="M0 0H46V.35H0Z" fill="#9d85ff"/></svg>'
for (const side of ['front','back']) test(`paint the showcase thin rule on ${side}`, async ({ page }) => {
 await page.goto('/')
 await page.getByRole('button',{name:'Open project',exact:true}).click()
 await page.getByLabel('Choose project file').setInputFiles({name:'thin.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,side,silk:false,mask:'#18161f',fabrication:false,board:{name:'Thin rule',bounds:{x:0,y:0,width:64,height:88},outline:'M0,0 L64,0 L64,88 L0,88 Z',holes:'',layers:{}},artwork:[{id:'rule',name:'Thin rule',source,x:9,y:30,width:46,height:.35,rotation:0,visible:true,side}]}))})
 await expect(page.locator('[data-artwork-layer="rule"] image')).toBeVisible()
 await page.getByRole('button',{name:side === 'front' ? 'Front' : 'Back',exact:true}).click()
 await page.getByRole('button',{name:'Live paint (K)',exact:true}).click()
 await page.getByRole('button',{name:'Paint Blue',exact:true}).click()
 for (const zoom of [0,1]) {
  if(zoom) for(let i=0;i<2;i++) await page.getByRole('button',{name:'Zoom in',exact:true}).click()
  const p=await page.locator('[data-artwork-layer="rule"] image').evaluate((im:SVGImageElement)=>{const p=new DOMPoint(im.x.baseVal.value+im.width.baseVal.value*.5,im.y.baseVal.value+im.height.baseVal.value*.5).matrixTransform(im.getScreenCTM()!);return{x:p.x,y:p.y}})
  await page.mouse.move(p.x,p.y)
  await expect(page.locator('[data-artwork-paint-preview] > path').first()).toBeVisible()
  await page.mouse.click(p.x,p.y)
  await expect(page.locator('[data-artwork-layer="rule"] image')).toHaveAttribute('href',/3586e8/)
  const pixel = await page.locator('[data-artwork-layer="rule"] image').evaluate(async (node) => {
    const image = new Image(); image.src = node.getAttribute('href')!; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = 460; canvas.height = 4
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 460, 4)
    return [10, 230, 450].map(x => [...context.getImageData(x, 2, 1, 1).data])
  })
  expect(pixel).toEqual([[53,134,232,255], [53,134,232,255], [53,134,232,255]])
  await page.mouse.move(10, 10)
  if (process.platform === 'darwin') await expect(page.locator('[data-artwork-layer="rule"] image')).toHaveScreenshot(`thin-${side}-${zoom}.png`)
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  await expect(page.locator('[data-artwork-layer="rule"] image')).toHaveAttribute('href',/9d85ff/)
 }
})
