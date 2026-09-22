import { createEditor } from '@overprint/editor'
import { makeBoard } from './fixture'
import { mountEditor } from './mount'
import artwork from '../../web/public/brand/overprint-light.svg?raw'
import './style.css'
export const addSample = controller => controller.addGraphic(new File([artwork], 'Overprint.svg', { type: 'image/svg+xml' }))

export const scenario = ({ theme = 'light', side = 'front', mode = 'board', framework = 'vanilla' } = {}) => {
  const controller = createEditor(makeBoard())
  controller.setSide(side)
  const root = document.createElement('div')
  root.className = 'scenario'
  const actions = document.createElement('nav')
  actions.className = 'host-actions'
  actions.setAttribute('aria-label', 'Host actions')
  const status = document.createElement('output')
  status.setAttribute('aria-live', 'polite')
  const target = document.createElement('div')
  const cleanup = [() => controller.destroy()]
  const button = (name, run) => {
    const element = document.createElement('button')
    element.textContent = name
    element.onclick = async () => {
      try { await run() } catch (error) { status.textContent = error.message }
    }
    actions.append(element)
    return element
  }
  root.append(actions, status, target)
  cleanup.push(mountEditor(framework, target, controller))
  // React mounts asynchronously; style the custom element once it is connected.
  const applyTheme = () => target.querySelector('overprint-editor')?.setAttribute('data-theme', theme)
  applyTheme()
  const observer = new MutationObserver(applyTheme)
  observer.observe(target, { childList: true, subtree: true })
  cleanup.push(() => observer.disconnect())
  if (mode === 'artwork' || mode === 'save' || mode === 'refresh' || mode === 'instances') {
    button('Add sample SVG', () => addSample(controller))
  }
  if (mode === 'save') {
    let saved
    const restore = button('Restore host save', async () => {
      await controller.restore(saved)
      status.textContent = `${saved.artwork.length} artwork restored by the host`
    })
    restore.disabled = true
    button('Save to host', () => {
      saved = controller.getDocument()
      restore.disabled = false
      status.textContent = `${saved.artwork.length} artwork saved in host memory`
    })
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = 'Document returned to the host'
    const pre = document.createElement('pre')
    const update = () => { const doc = controller.getDocument(); pre.textContent = JSON.stringify({ ...doc, board: { name: doc.board.name, bounds: doc.board.bounds } }, null, 2) }
    update()
    cleanup.push(controller.subscribe(update))
    details.append(summary, pre)
    root.append(details)
  }
  if (mode === 'refresh') button('Refresh board geometry', () => {
    controller.replaceBoard(makeBoard())
    status.textContent = 'Board snapshot reloaded; artwork and history preserved'
  })
  if (mode === 'load') {
    status.textContent = 'The host supplies board geometry. You can also import a local PCB file.'
    button('Load host board data', () => {
      controller.replaceBoard(makeBoard())
      status.textContent = 'Board loaded from host data'
    })
    const label = document.createElement('label')
    label.textContent = 'Load your PCB '
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.kicad_pcb'
    input.onchange = async () => {
      if (!input.files?.[0]) return
      try { await controller.loadBoard(input.files[0]); status.textContent = 'Board loaded locally' }
      catch (error) { status.textContent = error.message }
    }
    label.append(input)
    actions.append(label)
  }
  if (mode === 'instances') {
    const second = createEditor({ ...makeBoard(), name: `${makeBoard().name} · editor B` })
    const other = document.createElement('div')
    root.append(other)
    cleanup.push(() => second.destroy(), mountEditor('vanilla', other, second))
    other.querySelector('overprint-editor').setAttribute('data-theme', theme)
    button('Add SVG to editor B', () => addSample(second))
  }
  if (!actions.childElementCount) { actions.remove(); status.remove() }
  return { root, destroy: () => cleanup.reverse().forEach(dispose => dispose()) }
}
