import { chromium, expect, type Page } from '@playwright/test'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const output = resolve('artifacts/feature-showcase')
await mkdir(`${output}/assets`, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce', recordVideo: { dir: `${output}/assets/raw-video`, size: { width: 1600, height: 1000 } } })
const page = await context.newPage()
page.setDefaultTimeout(15000)
const fontRequests: {url:string; status:number}[] = []
await page.route('**/api/fonts/**', async route => {
  const u = new URL(route.request().url())
  const url = `https://overprint.ink${u.pathname}${u.search}`
  const response = await route.fetch({ url, headers: { origin: 'https://overprint.ink' } })
  fontRequests.push({ url, status: response.status() })
  await route.fulfill({ response })
})
const asset = (id:string,name:string,source:string,x:number,y:number,width:number,height:number,side='front') => ({id,name,source,x,y,width,height,side,rotation:0,visible:true})
const svg = (width:number,height:number,content:string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${content}</svg>`
const rect = (x:number,y:number,w:number,h:number) => `M${x} ${y}L${x+w} ${y}L${x+w} ${y+h}L${x} ${y+h}Z`
const hole = (x:number,y:number,r:number) => Array.from({length:32},(_,i)=>`${i?'L':'M'}${x+r*Math.cos(i*Math.PI/16)} ${y+r*Math.sin(i*Math.PI/16)}`).join(' ')+'Z'
const pads = Array.from({length:10},(_,i)=>[rect(1.9,24+i*4,2.3,2.1),rect(59.8,24+i*4,2.3,2.1)]).flat()
const native = Array.from({length:10},(_,i)=>[rect(5.4,24.5+i*4,.7,.3),rect(57.9,24.5+i*4,.7,.3)]).flat()
const board = { name: 'WEAVE / feature demonstrator', bounds:{x:0,y:0,width:64,height:88}, outline:'M5 0L59 0L64 5L64 83L59 88L5 88L0 83L0 5Z', holes:[hole(5,5,1.5),hole(59,5,1.5),hole(5,83,1.5),hole(59,83,1.5)].join(' '), layers:{'front-mask':pads,'back-mask':pads,'front-copper':pads,'back-copper':pads,'front-silkscreen':native,'back-silkscreen':native}, anchors: Array.from({length:10},(_,i)=>[{kind:'pad',name:`J1.${i+1}`,x:3.05,y:25.05+i*4},{kind:'pad',name:`J2.${i+1}`,x:60.95,y:25.05+i*4}]).flat() }
const ribbons = svg(40,28, `<path d="M0 0H10L30 28H20Z M15 0H25L40 21V28H35Z M0 12V26L2 28H12Z" fill="#c6f36b"/><path d="M0 28V21L30 0H40L0 28Z" fill="#9d85ff"/>`)
const circuit = svg(42,30, `<g fill="none" stroke="#8c7db8" stroke-width=".35"><path d="M0 4H12L18 10H42 M0 12H9L17 20H42 M0 24H6L12 30 M25 0V7L33 15H42"/></g><g fill="#c6f36b"><path d="${rect(20,10,10,9)}"/><path d="${rect(17,12,2,1)} ${rect(17,15,2,1)} ${rect(31,12,2,1)} ${rect(31,15,2,1)}"/></g>`)
const seed:any = { version:1,board,side:'front',silk:true,mask:'#18161f',fabrication:false,palette:[{name:'Acid',color:'#c6f36b'},{name:'Iris',color:'#9d85ff'},{name:'Paper',color:'#f4f0e5'}],artwork:[asset('weave-mark','Woven mark',ribbons,12,35,40,28),asset('rear-circuit','Circuit motif',circuit,11,34,42,30,'back'),asset('front-rule','Front rule',svg(46,.35,'<path d="M0 0H46V.35H0Z" fill="#9d85ff"/>'),9,30,46,.35),asset('back-rule','Rear rule',svg(46,.35,'<path d="M0 0H46V.35H0Z" fill="#c6f36b"/>'),9,30,46,.35,'back')] }
const openProject = async (project:any) => {
  await page.goto('http://127.0.0.1:14357/')
  if (await page.getByRole('button',{name:'Open project',exact:true}).isVisible()) await page.getByRole('button',{name:'Open project',exact:true}).click()
  await page.getByLabel('Choose project file').setInputFiles({ name:'weave-showcase.overprint',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project)) })
  await expect(page.getByRole('status')).toContainText('Project opened')
  await expect(page.locator('[data-board-side="front"]')).toBeVisible()
}
const position = (x:number,y:number,side='front') => page.locator(`[data-board-side="${side}"] [data-board-coordinates]`).evaluate((g,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform((g as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y}},[x,y])
const text = async (content:string,x:number,y:number,size:number,side='front',fill='#f4f0e5') => {
  await page.getByRole('button',{name:'Draw text',exact:true}).click()
  const p=await position(x,y,side);await page.mouse.click(p.x,p.y)
  await expect(page.getByLabel('Text content',{exact:true})).toHaveValue('Text')
  await page.getByLabel('Text content',{exact:true}).fill(content)
  await expect(page.getByText('Updating text…',{exact:true})).toHaveCount(0)
  await page.getByLabel('Text size (mm)',{exact:true}).fill(String(size))
  await expect(page.getByText('Updating text…',{exact:true})).toHaveCount(0)
  await page.getByLabel('Text fill',{exact:true}).fill(fill)
  await expect(page.getByText('Updating text…',{exact:true})).toHaveCount(0)
}
const save = async (name?:string) => {
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Save project',exact:true}).click()
  const download=await downloading, project=JSON.parse(await readFile((await download.path())!,'utf8'))
  if(name) await writeFile(`${output}/${name}.overprint`,JSON.stringify(project,null,2))
  return project
}
const capture = async (name:string) => { await page.mouse.move(800,950);await page.waitForTimeout(700);await page.screenshot({path:`${output}/assets/${name}.png`});console.log(`Captured ${name}`) }
const section = async (name:string) => {
 const panels: Record<string,[string,string]> = {'Palette and fills':['Color','Color tools'],'Smart placement':['Layout','Layout tools'],'Print review':['Board','Print checks'],'PCB revisions':['Board','PCB updates']}
 const [tab,region]=panels[name]!
 await page.getByRole('tab',{name:tab,exact:true}).click()
 return page.getByRole('region',{name:region,exact:true})
}
const draw = async (tool:string,x:number,y:number,w:number,h:number,side='front') => { if(!(await page.getByRole('button',{name:tool,exact:true}).isVisible())) await page.getByRole('button',{name:'More shape tools',exact:true}).click();await page.getByRole('button',{name:tool,exact:true}).click();const p=await position(x,y,side),q=await position(x+w,y+h,side);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:12});await page.mouse.up() }
try {
  await openProject(seed)
  await text('MAKE\nWAVES',9,8,7)
  await page.getByRole('combobox',{name:'Font style',exact:true}).focus()
  await page.getByRole('combobox',{name:'Font style',exact:true}).selectOption('700')
  await expect(page.getByText('Updating text…',{exact:true})).toHaveCount(0)
  await text('FULL COLOR. BOTH SIDES.',9,27,1.55,'front','#c6f36b')
  await text('WEAVE / 001',9,68,3.4)
  await text('DESIGNED TO BE DIFFERENT',9,76,1.4,'front','#9d85ff')
  await text('BUILT\nTO REPEAT',9,8,6.4,'back')
  await text('LOCAL FIRST / EDITABLE ALWAYS',9,27,1.4,'back','#c6f36b')
  await text('SAME BOARD.\nNEW POSSIBILITIES.',9,68,2.7,'back','#9d85ff')
  const project=await save();project.side='front'
  for(const item of project.artwork) if(item.drawing?.type==='text') item.name=item.drawing.content.replaceAll('\n',' ')
  await writeFile(`${output}/weave-showcase.overprint`,JSON.stringify(project,null,2))
  await writeFile(`${output}/capture-base.json`,JSON.stringify(project))
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  await page.locator('aside > .overflow-y-auto').first().evaluate(e=>e.scrollTop=0)
  await capture('01-both-sides')
  await page.getByRole('button',{name:'MAKE WAVES',exact:true}).click()
  await page.getByRole('combobox',{name:'Font family',exact:true}).click()
  await page.getByRole('combobox',{name:'Search font families',exact:true}).fill('Space')
  await expect(page.getByRole('option',{name:'Space Grotesk',exact:true})).toBeVisible()
  await page.getByRole('option',{name:'Space Grotesk',exact:true}).hover()
  await capture('02-google-fonts')
  await page.keyboard.press('Escape')
  const vectorProject=structuredClone(project);vectorProject.artwork=vectorProject.artwork.filter((i:any)=>i.id!=='weave-mark');await openProject(vectorProject)
  await draw('Draw rectangle',12,35,40,26)
  await page.getByLabel('Shape fill',{exact:true}).fill('#9d85ff')
  await page.getByLabel('Shape fill',{exact:true}).press('Tab')
  await draw('Draw rectangle',20,41,24,14)
  await page.getByRole('button',{name:'Rectangle',exact:true}).first().click()
  await page.getByRole('button',{name:'Rectangle',exact:true}).last().click({modifiers:['Shift']})
  await page.getByRole('button',{name:'Subtract top',exact:true}).click()
  await page.getByRole('checkbox',{name:'Edit vector nodes',exact:true}).check()
  await page.getByRole('checkbox',{name:'Edit vector nodes',exact:true}).scrollIntoViewIfNeeded()
  await capture('03-vector-nodes')
  await save('vector-playground')
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  await page.getByRole('button',{name:'Woven mark',exact:true}).click()
  const palette=await section('Palette and fills')
  await palette.getByRole('button',{name:'Change fill #c6f36b',exact:true}).click()
  const fillPicker=page.getByRole('dialog',{name:'Fill color',exact:true})
  await fillPicker.getByRole('textbox',{name:'Hex color',exact:true}).fill('69c6ff')
  await fillPicker.getByRole('textbox',{name:'Hex color',exact:true}).press('Enter')
  await fillPicker.getByRole('button',{name:'Apply color',exact:true}).click()
  await capture('04-palettes-fills')
  await save('color-playground')
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  await draw('Draw ellipse',12,64,2,2,'back')
  const placement=await section('Smart placement')
  await placement.getByLabel('Total copies',{exact:true}).fill('7')
  await placement.getByLabel('Repeat X spacing',{exact:true}).fill('6')
  await placement.getByRole('button',{name:'Preview repeat',exact:true}).click()
  await expect(page.locator('[data-repeat-preview]')).toHaveCount(6)
  await capture('05-smart-placement')
  await placement.getByRole('button',{name:'Apply repeat',exact:true}).click()
  await save('repeat-playground')
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  await page.getByRole('button',{name:'Library',exact:true}).click()
  const library=page.getByRole('dialog',{name:'Composition library',exact:true})
  for(const checkbox of await library.getByRole('checkbox').all())await checkbox.check()
  await library.getByLabel('Composition name',{exact:true}).fill('WEAVE / two-sided identity')
  await library.getByRole('button',{name:'Save selection',exact:true}).click()
  await expect(library.getByRole('heading',{name:'WEAVE / two-sided identity',exact:true})).toBeVisible()
  await capture('06-library')
  await library.getByRole('button',{name:'Close library',exact:true}).click()
  const review=structuredClone(project)
  review.artwork.push(asset('fine-line','Thin trace / review example',svg(.09,12,'<path d="M0 0H.09V12H0Z" fill="#ff8b7b"/>'),2.5,24,.09,12))
  await openProject(review)
  const printing=await section('Print review')
  await printing.getByRole('button',{name:'Run print checks',exact:true}).click()
  await expect(printing.getByRole('button',{name:/Review finding .*thin-feature/}).first()).toBeVisible()
  await printing.getByRole('button',{name:/Review finding .*thin-feature/}).last().scrollIntoViewIfNeeded()
  await capture('07-print-review')
  const report=page.waitForEvent('download');await printing.getByRole('button',{name:'Download review',exact:true}).click();await(await report).saveAs(`${output}/print-review.json`)
  await save('print-review-playground')
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  const next=structuredClone(board);next.outline='M5 0L55 0L64 9L64 83L59 88L5 88L0 83L0 5Z';next.anchors[0].x+=3
  const ring=[[5,0],[55,0],[64,9],[64,83],[59,88],[5,88],[0,83],[0,5]]
  const updated=zipSync({'manifest.json':strToU8(JSON.stringify({format:'overprint-board',version:1,board:{name:next.name,boundsMm:next.bounds},coordinates:{units:'mm',backDisplay:'mirror-x-about-board-center'}})),'geometry.json':strToU8(JSON.stringify({outlines:[{outer:ring,holes:[]}],holes:[],pads:next.anchors.map(a=>({number:a.name,positionMm:[a.x,a.y]})),footprints:[]})),...Object.fromEntries(['front','back'].flatMap(side=>['silkscreen','mask','copper','fabrication'].map(layer=>[`layers/${side}-${layer}.svg`,strToU8(`<svg xmlns="http://www.w3.org/2000/svg">${(next.layers[`${side}-${layer}` as keyof typeof next.layers]??[]).map(d=>`<path d="${d}"/>`).join('')}</svg>`)])))})
  await section('PCB revisions')
  await page.getByLabel('Choose PCB update',{exact:true}).setInputFiles({name:'weave-revision.overprint-board',mimeType:'application/zip',buffer:Buffer.from(updated)})
  await expect(page.getByRole('dialog',{name:'Review PCB update',exact:true})).toBeVisible()
  await capture('08-pcb-revisions')
  await page.getByRole('button',{name:'Cancel update',exact:true}).click()
  await openProject(project);await page.getByRole('tab',{name:'Layers',exact:true}).click()
  await page.getByRole('button',{name:'More shape tools',exact:true}).click()
  await capture('09-grouped-tools')
  await writeFile(`${output}/capture-metadata.json`,JSON.stringify({capturedAt:new Date().toISOString(),source:'Actual local Overprint editor UI',board:'Illustrative synthetic PCB; not a production circuit',fonts:'Live deployed Google Fonts endpoints; no mocked font files or bundled fallback',fontRequests},null,2))
  console.log('SHOWCASE CAPTURE COMPLETE')
} catch(error) {
  await page.screenshot({path:`${output}/assets/capture-error.png`}).catch(()=>{})
  await writeFile(`${output}/capture-error.txt`,String(error))
  throw error
} finally {
  const video=page.video();await context.close();if(video)await video.saveAs(`${output}/assets/editor-walkthrough.webm`);await browser.close()
}
