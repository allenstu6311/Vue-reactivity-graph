<script setup lang="ts">
import { ref } from 'vue'

export interface TreeNode {
  uid: string
  name: string
  path: string
  children: TreeNode[]
}

const props = defineProps<{
  node: TreeNode
  selectedUid?: string
  level?: number
}>()

const emit = defineEmits<{
  select: [uid: string]
}>()

const expanded = ref(true)
</script>

<template>
  <div class="tree-item-wrapper">
    <div
      class="tree-node"
      :class="{ selected: (selectedUid ?? '') === node.uid }"
      :style="{ paddingLeft: `${(level ?? 0) * 12}px` }"
      @click="emit('select', node.uid)"
    >
      <span
        v-if="node.children.length > 0"
        class="expand-icon"
        :class="{ expanded }"
        @click.stop="expanded = !expanded"
      >▶</span>
      <span v-else class="expand-icon-placeholder" />
      <span class="node-name">&lt;{{ node.name }}&gt;</span>
    </div>
    <template v-if="expanded && node.children.length > 0">
      <TreeItem
        v-for="child in node.children"
        :key="child.uid"
        :node="child"
        :selected-uid="selectedUid"
        :level="(level ?? 0) + 1"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-item-wrapper { width: 100%; }

.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
  color: #8aa4c8;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.tree-node:hover { background: #172030; }

.tree-node.selected {
  background: rgba(66, 211, 146, 0.1);
  color: #42d392;
  border-left: 2px solid #42d392;
  padding-left: 6px;
}

.tree-node.selected:hover { background: rgba(66, 211, 146, 0.15); }

.expand-icon {
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #4a5f7a;
  transition: transform 0.15s;
  cursor: pointer;
  flex-shrink: 0;
}

.expand-icon.expanded { transform: rotate(90deg); }

.expand-icon-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
