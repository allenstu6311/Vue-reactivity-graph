<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  value: unknown
  depth?: number
  maxAutoExpand?: number
}>()

const depth = props.depth ?? 0
const maxAutoExpand = props.maxAutoExpand ?? 2
const open = ref(depth < maxAutoExpand)

// 型別判斷邏輯（必須照順序，否則 [Circular] 會被 primitive 分支吃掉）
function isCircular(): boolean {
  return props.value === '[Circular]'
}

function isNull(): boolean {
  return props.value === null
}

function isUndefined(): boolean {
  return props.value === undefined
}

function isPrimitive(): boolean {
  return typeof props.value !== 'object'
}

function isArray(): boolean {
  return Array.isArray(props.value)
}

function isObject(): boolean {
  return typeof props.value === 'object'
}

function isString(): boolean {
  return typeof props.value === 'string'
}

function isBoolean(): boolean {
  return typeof props.value === 'boolean'
}

function getKeys(): (string | number)[] {
  if (isArray()) {
    return Array.from({ length: (props.value as Array<unknown>).length }, (_, i) => i)
  }
  return Object.keys(props.value as object)
}
</script>

<template>
  <!-- [Circular] -->
  <span v-if="isCircular()" style="color: #f87171">[Circular]</span>

  <!-- null -->
  <span v-else-if="isNull()" style="color: #4a6080">null</span>

  <!-- undefined -->
  <span v-else-if="isUndefined()" style="color: #4a6080">undefined</span>

  <!-- primitive -->
  <span v-else-if="isPrimitive()">
    <!-- string with quotes -->
    <span v-if="isString()" style="color: #fb923c">"{{ value }}"</span>
    <!-- number -->
    <span v-else-if="typeof value === 'number'" style="color: #fb923c">{{ value }}</span>
    <!-- boolean -->
    <span v-else-if="isBoolean()" style="color: #c084fc">{{ value }}</span>
    <!-- fallback -->
    <span v-else style="color: #cdd9ee">{{ String(value) }}</span>
  </span>

  <!-- Array or Object -->
  <div v-else :style="{ paddingLeft: depth > 0 ? '12px' : '0' }">
    <div class="toggle-row">
      <button
        class="toggle-btn"
        @click="open = !open"
        :style="{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }"
      >
        ▶
      </button>
      <span v-if="isArray()" style="color: #cdd9ee">Array({{ (value as Array<unknown>).length }})</span>
      <span v-else style="color: #cdd9ee">Object</span>
    </div>

    <template v-if="open">
      <div
        v-for="(key, idx) in getKeys()"
        :key="`${depth}-${idx}`"
        :style="{ paddingLeft: depth > 0 ? '12px' : '0' }"
      >
        <div class="item-row">
          <span v-if="isArray()" style="color: #cdd9ee">[{{ key }}]:</span>
          <span v-else style="color: #cdd9ee">{{ key }}:</span>
        </div>
        <div :style="{ paddingLeft: '12px' }">
          <ValTree
            :value="(value as Record<string | number, unknown>)[key]"
            :depth="depth + 1"
            :max-auto-expand="maxAutoExpand"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toggle-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toggle-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: #6e89b0;
  font-size: 12px;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
  font-family: 'JetBrains Mono', monospace;
}

.toggle-btn:hover {
  color: #8ba5c4;
}

.item-row {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
</style>
