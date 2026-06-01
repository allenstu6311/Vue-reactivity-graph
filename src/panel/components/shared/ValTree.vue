<script setup lang="ts">
import { reactive } from "vue";
import { formatLeafValue } from "./nodeDisplay";

const props = defineProps<{
  value: unknown;
  depth?: number;
  maxAutoExpand?: number;
}>();

const depth = props.depth ?? 0;
const maxAutoExpand = props.maxAutoExpand ?? 2;

// 每個 key 自己一個展開狀態。undefined 代表還沒被使用者切換過，
// 此時回退到「depth+1 < maxAutoExpand」自動展開規則（子層的 depth 是當前 +1）。
const openMap = reactive<Record<string | number, boolean>>({});

function isOpen(key: string | number): boolean {
  return openMap[key] ?? depth + 1 < maxAutoExpand;
}

function toggle(key: string | number): void {
  openMap[key] = !isOpen(key);
}

// 型別判斷邏輯（必須照順序，否則 [Circular] 會被 primitive 分支吃掉）
function isCircular(): boolean {
  return props.value === "[Circular]";
}

function isNull(): boolean {
  return props.value === null;
}

function isUndefined(): boolean {
  return props.value === undefined;
}

function isPrimitive(): boolean {
  return typeof props.value !== "object";
}

function isArray(): boolean {
  return Array.isArray(props.value);
}

function isObject(): boolean {
  return typeof props.value === "object";
}

function isString(): boolean {
  return typeof props.value === "string";
}

function isBoolean(): boolean {
  return typeof props.value === "boolean";
}

function getKeys(): (string | number)[] {
  if (isArray()) {
    return Array.from(
      { length: (props.value as Array<unknown>).length },
      (_, i) => i,
    );
  }
  return Object.keys(props.value as object);
}

function getVal(key: string | number): unknown {
  return (props.value as Record<string | number, unknown>)[key];
}

const isPrimitiveVal = (key: string | number): boolean => {
  const val = getVal(key);
  // 只要 val 不等於 Object(val)，它就一定是基本型別（且包含 null 也能正確判斷）
  return val !== Object(val);
};

</script>

<template>
  <div class="" :style="{ paddingLeft: depth > 0 ? '8px' : '0', paddingTop: depth > 0 ? '4px' : '0' }">
    <div class="row" v-for="(key, idx) in getKeys()" :key="`${depth}-${idx}`">
      <div class="toggle-row">
        <button
          v-if="!isPrimitiveVal(key)"
          class="toggle-btn"
          @click="toggle(key)"
          :style="{ transform: isOpen(key) ? 'rotate(90deg)' : 'rotate(0deg)' }"
        >
          ▶
        </button>
        <span>{{ key }}:</span>
        <span v-if="isObject() && !isPrimitiveVal(key)" style="color: #cdd9ee">Object</span>
        <span v-else>{{ formatLeafValue(getVal(key)) }}</span>
      </div>

      <!-- 子層 ValTree：每個 key 各自依 isOpen(key) 展開 -->
      <div
        v-if="isOpen(key) && !isPrimitiveVal(key)"
        :style="{ paddingLeft: '12px' }"
      >
        <ValTree
          :value="getVal(key)"
          :depth="depth + 1"
          :max-auto-expand="maxAutoExpand"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.row{
  margin-bottom: 4px;
}

.row span{
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
}

.toggle-row {
  display: flex;
  gap: 4px;
}

.toggle-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: #6e89b0;
  font-size: 13px;
  /* width: 13px;
  height: 13px; */
  /* display: flex;
  align-items: center;
  justify-content: center; */
  transition: transform 0.15s ease;
  font-family: "JetBrains Mono", monospace;
}

.toggle-btn:hover {
  color: #8ba5c4;
}

.item-row {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
