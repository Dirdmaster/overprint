<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import EditorSession from './EditorSession.vue'
import { editorSession, type EditorController } from './controller'
const props = defineProps<{ controller: EditorController }>()
const session = shallowRef(editorSession(props.controller))
watch(() => props.controller, controller => { session.value = editorSession(controller) })
</script>
<template><EditorSession :key="session.id" :controller="controller" /></template>
