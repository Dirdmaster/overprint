<script setup lang="ts">
const emit = defineEmits<{ selected: [file: File] }>()
const picker = useTemplateRef('picker')
const show = () => {
  picker.value?.click()
}
const select = () => {
  const file = picker.value?.files?.[0]
  if (picker.value) picker.value.value = ''
  if (file) emit('selected', file)
}
defineExpose({ show })
</script>

<template>
  <input
    ref="picker"
    class="hidden"
    type="file"
    accept=".overprint,application/json"
    :aria-label="$t('editor.chooseProject')"
    @change="select"
  />
</template>
