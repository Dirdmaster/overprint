import { defineComponent, getCurrentInstance, h, inject, provide, onMounted, onBeforeUnmount, shallowRef, watch, computed, readonly, type InjectionKey, type ComputedRef, type PropType } from 'vue'
import type { EditorController, EditorDocument, EditorPart } from './index'
import { startSession, mountPart, presentation, type Theme } from './adapters/shared'
import { sessionProps, presentationProps } from './adapters/vueProps'

const contextKey: InjectionKey<{ controller: ReturnType<typeof shallowRef<EditorController | null>>; theme: ComputedRef<Theme> }> = Symbol('overprint-framework-editor')
const context = () => {
  const value = inject(contextKey)
  if (!value) throw new Error('Editor parts and composables must be inside EditorRoot.')
  return value
}
/** Use inside a child of EditorRoot, which renders only after initialization. */
export const useEditor = (): EditorController => {
  const controller = context().controller.value
  if (!controller) throw new Error('The editor session is not ready.')
  return controller
}
export const useEditorState = () => {
  const controller = useEditor()
  const state = shallowRef(controller.getState())
  const unsubscribe = controller.subscribeState(value => { state.value = value })
  onBeforeUnmount(unsubscribe)
  return readonly(state)
}
const events = {
  ready: (_controller: EditorController) => true,
  change: (_document: EditorDocument) => true,
  error: (_error: Error) => true,
}
export const EditorRoot = defineComponent({
  name: 'OverprintEditorRoot',
  props: sessionProps,
  emits: events,
  setup(props, { slots, emit }) {
    const instance = getCurrentInstance()!
    const controller = shallowRef<EditorController | null>(null)
    const error = shallowRef<Error | null>(null)
    provide(contextKey, { controller, theme: computed(() => props.theme) })
    onMounted(() => {
      watch(() => props.board, (board, _previous, onCleanup) => {
        controller.value = null
        error.value = null
        let unsubscribe: (() => void) | undefined
        const stop = startSession(board, { side: props.side, mask: props.mask }, editor => {
          controller.value = editor
          unsubscribe = editor.subscribe(() => { if (instance.vnode.props?.onChange) emit('change', editor.getDocument()) })
          emit('ready', editor)
        }, value => { error.value = value; emit('error', value) })
        onCleanup(() => { unsubscribe?.(); stop() })
      }, { immediate: true, flush: 'sync' })
    })
    watch(() => props.side, side => { if (side) controller.value?.setSide(side) })
    watch(() => props.mask, mask => { if (mask) controller.value?.setMaskColor(mask) })
    return () => h('div', {}, error.value ? h('p', { role: 'alert' }, error.value.message) : controller.value ? slots.default?.() : [])
  },
})
const part = (kind: EditorPart) => defineComponent({
  name: `Overprint${kind}`,
  props: { ...presentationProps, theme: String as PropType<Theme> },
  setup(props) {
    const { theme } = context()
    const controller = useEditor()
    const host = shallowRef<HTMLElement | null>(null)
    let element: ReturnType<typeof mountPart> | undefined
    onMounted(() => { element = mountPart(host.value!, kind, controller, props, props.theme || theme.value) })
    watch(() => [presentation(props), props.theme, theme.value], () => {
      if (!element) return
      Object.assign(element, presentation(props))
      element.dataset.theme = props.theme || theme.value
    }, { deep: true })
    onBeforeUnmount(() => element?.remove())
    return () => h('div', { ref: host })
  },
})
export const Canvas = part('canvas')
export const Toolbar = part('toolbar')
export const Palette = part('palette')
export const Layers = part('layers')
export const Properties = part('properties')
export const ViewControls = part('view-controls')
export const ZoomControls = part('zoom-controls')
const Surface = part('editor')
export const Editor = defineComponent({
  name: 'OverprintEditor',
  inheritAttrs: false,
  props: { ...sessionProps, ...presentationProps },
  emits: events,
  setup(props, { attrs, emit }) {
    const instance = getCurrentInstance()!
    return () => h(EditorRoot, {
      ...attrs, board: props.board, side: props.side, mask: props.mask, theme: props.theme,
      onReady: (editor: EditorController) => emit('ready', editor),
      onChange: instance.vnode.props?.onChange ? (document: EditorDocument) => emit('change', document) : undefined,
      onError: (error: Error) => emit('error', error),
    }, () => h(Surface, presentation(props)))
  },
})
