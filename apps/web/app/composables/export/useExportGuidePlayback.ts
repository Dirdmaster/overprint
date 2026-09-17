import { onBeforeUnmount, ref, type Ref } from 'vue'

/** Reading timer for the guide, independent of manufacturing/upload progress. */
export const useExportGuidePlayback = (step: Ref<number>, count: number) => {
  const playing = ref(false)
  const fraction = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined
  const pause = () => {
    if (timer) clearInterval(timer)
    timer = undefined
    playing.value = false
  }
  const play = () => {
    pause()
    fraction.value = 0
    playing.value = true
    let started = Date.now()
    timer = setInterval(() => {
      if (document.hidden) { started = Date.now(); fraction.value = 0; return }
      const elapsed = Date.now() - started
      if (elapsed >= 4000) {
        step.value = (step.value + 1) % count
        started = Date.now()
        fraction.value = 0
      } else fraction.value = elapsed / 4000
    }, 100)
  }
  const start = () => {
    pause()
    step.value = 0
    fraction.value = 0
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play()
  }
  const select = (index: number) => { pause(); fraction.value = 0; step.value = index }
  onBeforeUnmount(pause)
  return { playing, fraction, start, play, pause, select }
}
