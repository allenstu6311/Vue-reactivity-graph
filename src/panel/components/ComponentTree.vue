<script setup lang="ts">
import { computed } from 'vue'
import type { GraphData } from '../../graph'
import TreeItem, { type TreeNode } from './TreeItem.vue'

const props = defineProps<{
  graph: GraphData
  selectedUid: string
}>()

const emit = defineEmits<{
  select: [uid: string]
}>()

const searchQuery = defineModel<string>('searchQuery', { default: '' })

const filteredNodes = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase()
  if (!keyword) return null  // null = 顯示完整樹

  const result: TreeNode[] = []
  for (const [uid, meta] of Object.entries(props.graph.components)) {
    if (meta.name.toLowerCase().includes(keyword)) {
      result.push({
        uid,
        name: meta.name,
        path: '',
        children: [],
      })
    }
  }
  return result
})

const treeStructure = computed(() => {
  const root: TreeNode[] = []
  const uidToNode = new Map<string, TreeNode>()

  // 第一輪：建立所有 uid → TreeNode
  for (const [uid, meta] of Object.entries(props.graph.components)) {
    uidToNode.set(uid, { uid, name: meta.name, path: meta.path, children: [] })
  }

  // 第二輪：接 parent/children
  for (const [uid, meta] of Object.entries(props.graph.components)) {
    const node = uidToNode.get(uid)!
    if (meta.parentUid === undefined) {
      root.push(node)
    } else {
      const parent = uidToNode.get(meta.parentUid.toString())
      if (parent) parent.children.push(node)
      else root.push(node)
    }
  }

  return root
})
</script>

<template>
  <div class="component-tree">
    <div class="tree-search">
      <input
        v-model="searchQuery"
        class="tree-search-input"
        type="text"
        placeholder="Find components..."
      />
    </div>

    <!-- 搜尋結果（平鋪） -->
    <div v-if="filteredNodes !== null" class="tree-list">
      <div v-if="filteredNodes.length === 0" class="empty-state">No results</div>
      <TreeItem
        v-for="item in filteredNodes"
        :key="item.uid"
        :node="item"
        :selected-uid="selectedUid"
        @select="emit('select', $event)"
      />
    </div>

    <!-- 原始樹（無搜尋時） -->
    <div v-else class="tree-list">
      <div v-if="treeStructure.length === 0" class="empty-state">No components</div>
      <TreeItem
        v-for="node in treeStructure"
        :key="node.uid"
        :node="node"
        :selected-uid="selectedUid"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.component-tree {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.tree-search {
  padding: 8px;
  border-bottom: 1px solid #1f2e45;
  flex-shrink: 0;
}

.tree-search-input {
  width: 100%;
  background: #1c2840;
  border: 1px solid #2a3f5c;
  color: #cdd9ee;
  border-radius: 5px;
  padding: 5px 10px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}

.tree-search-input::placeholder { color: #334560; }
.tree-search-input:focus { border-color: #42d392; }

.empty-state {
  padding: 20px 10px;
  text-align: center;
  color: #4a5f7a;
  font-size: 12px;
}

.tree-list {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
}
</style>

<style>
.tree-list::-webkit-scrollbar { width: 4px; }
.tree-list::-webkit-scrollbar-thumb { background: #2a3f5c; border-radius: 2px; }
</style>
