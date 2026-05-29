<script setup lang="ts">
import { computed } from "vue";
import type { GraphNode } from "../../graph";
import { NODE_TYPE_META } from "../nodeTypeMeta";
import ValTree from "./shared/ValTree.vue";
// import { isObject } from "../../injected/helper/guards";

const props = defineProps<{
  node: GraphNode | null;
}>();

const tc = computed(() =>
  props.node ? NODE_TYPE_META[props.node.type] : null,
);

// function toVscodeUrl(filePath: string): string {
//   const normalized = filePath.replace(/\\/g, '/')
//   const segments = normalized.split('/')
//   const encoded = segments.map((s, i) => {
//     // 保留 Windows drive letter（第一段如 "C:"），不要 encode colon
//     if (i === 0 && /^[A-Za-z]:$/.test(s)) return s
//     return encodeURIComponent(s)
//   }).join('/')
//   return `vscode://file/${encoded}`
// }
</script>

<template>
  <div class="detail">
    <!-- Empty state -->
    <div v-if="!props.node" class="empty">
      <div class="empty-ring">⬡</div>
      <span>選擇左側變數以顯示詳細資訊</span>
    </div>

    <!-- Node detail -->
    <div v-else class="content">
      <!-- Type badge + varName -->
      <div class="row">
        <span
          v-if="tc"
          class="tbadge"
          :style="{
            color: tc.color,
            background: tc.background,
            border: `1px solid ${tc.border}`,
          }"
        >
          {{ tc.label }}
        </span>
        <span v-if="props.node.varName" class="var-name">{{
          props.node.varName
        }}</span>
      </div>

      <!-- Name -->
      <div v-if="props.node.name" class="row">
        <span class="label">{{
          props.node.type === "store" ? "Store" : "Component"
        }}</span>
        <span class="value">{{ props.node.name }}</span>
      </div>

      <!-- Path -->
      <div v-if="props.node.path" class="row">
        <span class="label">Path</span>
        <span class="value">{{ props.node.path }}</span>
      </div>

      <!-- filePath -->
      <div class="row">
        <span class="label">File</span>
        <span v-if="props.node.filePath" class="value">
          <!-- <a :href="toVscodeUrl(props.node.filePath)">{{ props.node.filePath }}</a> -->
          <p>{{ props.node.filePath }}</p>
        </span>
        <span v-else class="value empty-file">—</span>
      </div>

      <!-- Val tree -->
      <div class="">
        <div class="" v-if="typeof props.node.val === 'object' && props.node.val !== null">
          <span class="label">Value</span>
          <div
            class="val-container">
            <ValTree
              :key="props.node.id"
              :value="props.node.val"
              :max-auto-expand="0"
            />
          </div>
        </div>

        <div class="row val-row" v-else>
          <span class="label">Value</span>
          <span>{{ props.node.val }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #334560;
  font-size: 13px;
}

.empty-ring {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1.5px solid #1f2e45;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  /* flex-wrap: wrap; */
}

.val-row {
  /* flex-direction: column; */
  gap: 6px;
}

.tbadge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  flex-shrink: 0;
  white-space: nowrap;
}

.var-name {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: #cdd9ee;
  word-break: break-all;
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: #8ba5c4;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
  min-width: 50px;
}

.value {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: #cdd9ee;
  word-break: break-all;
}

/* .value p {
  color: #60a5fa;
  text-decoration: none;
  transition: color 0.15s;
} */

/* .value p:hover {
  color: #93c5fd;
  text-decoration: underline;
} */

.empty-file {
  color: #4a6080;
}

.val-container {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  padding: 6px 0;
}

::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-thumb {
  background: #2a3f5c;
  border-radius: 2px;
}
</style>
