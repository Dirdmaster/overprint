import { shallowRef, watch } from 'vue'

export const useWorkspaceNotice = () => {
  const notice = shallowRef<{ message: string; persistent: boolean }>()
  const dismiss = () => { notice.value = undefined }

  watch(notice, (current, _, onCleanup) => {
    if (!current || current.persistent) return
    const timer = setTimeout(dismiss, 4000)
    onCleanup(() => clearTimeout(timer))
  }, { flush: 'sync' })

  const show = (message: string, { persistent = false } = {}) => {
    notice.value = { message, persistent }
  }

  return { notice, show, dismiss }
}
