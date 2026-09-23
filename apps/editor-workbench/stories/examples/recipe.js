import { createEditor, registerEditor, createEditorHistory } from '@overprint/editor'

export const mountRecipe = (host, board, mode, nextBoard = board) => {
  registerEditor()
  const editor = createEditor(board)
  const element = document.createElement('overprint-editor')
  element.controller = editor
  const actions = document.createElement('nav')
  actions.className = 'host-actions'
  const output = document.createElement('output')
  output.setAttribute('aria-live', 'polite')
  const run = async (action) => {
    try {
      const succeeded = await action()
      if (succeeded !== false) output.textContent = 'Done'
    } catch (error) {
      output.textContent = error.message
    }
  }
  const button = (label, action) => {
    const control = document.createElement('button')
    control.textContent = label
    control.onclick = () => run(action)
    actions.append(control)
    return control
  }
  let unsubscribe
  if (mode === 'save') {
    const history = createEditorHistory(editor)
    const save = button('Save checkpoint', history.checkpoint)
    const restore = button('Restore checkpoint', history.restore)
    const update = () => {
      const { canRestore, pending, error } = history.getState()
      save.disabled = pending
      restore.disabled = !canRestore
      output.textContent = error || ''
    }
    unsubscribe = history.subscribe(update)
    update()
  } else if (mode === 'load') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.kicad_pcb'
    input.setAttribute('aria-label', 'Load your PCB')
    input.onchange = () =>
      run(async () => {
        if (input.files?.[0]) await editor.loadBoard(input.files[0])
        input.value = ''
      })
    actions.append(input)
  } else button('Refresh board geometry', () => editor.replaceBoard(nextBoard))
  host.append(actions, output, element)
  return () => {
    unsubscribe?.()
    element.remove()
    actions.remove()
    output.remove()
    editor.destroy()
  }
}
