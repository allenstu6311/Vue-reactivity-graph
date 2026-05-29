<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
}>()

const emit = defineEmits<{
  'update:modelValue': [width: number]
  dragEnd: []
}>()

const isDragging = ref(false)
let startX = 0
let startWidth = 0
let prevUserSelect = ''
let prevCursor = ''

function cleanupDrag() {
  document.body.style.userSelect = prevUserSelect
  document.body.style.cursor = prevCursor
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function onMouseDown(e: MouseEvent) {
  if (isDragging.value) return
  e.preventDefault()
  isDragging.value = true
  startX = e.clientX
  startWidth = props.modelValue
  prevUserSelect = document.body.style.userSelect
  prevCursor = document.body.style.cursor
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  const delta = e.clientX - startX
  const newWidth = Math.min(props.max, Math.max(props.min, startWidth + delta))
  emit('update:modelValue', newWidth)
}

function onMouseUp() {
  if (!isDragging.value) return
  isDragging.value = false
  cleanupDrag()
  emit('dragEnd')
}

onUnmounted(() => {
  if (isDragging.value) {
    isDragging.value = false
    cleanupDrag()
  }
})
</script>

<template>
  <div
    class="splitter"
    :class="{ dragging: isDragging }"
    @mousedown="onMouseDown"
  />
</template>

<style scoped>
.splitter {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 10;
  transition: background 0.15s;
}

.splitter::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: #1f2e45;
  transition: background 0.15s;
}

.splitter:hover::after,
.splitter.dragging::after {
  background: #42d392;
}
</style>
