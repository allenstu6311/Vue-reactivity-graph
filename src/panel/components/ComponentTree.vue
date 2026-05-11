<script setup lang="ts">
import { computed, defineComponent, h, ref, type VNode } from 'vue'
import type { GraphData } from '../../graph'

const props = defineProps<{
  graph: GraphData
  selectedUid: string
}>()

const emit = defineEmits<{
  select: [uid: string]
}>()

interface TreeNode {
  uid: string
  name: string
  path: string
  children: TreeNode[]
}

const TreeItem = defineComponent({
  props: {
    node: { type: Object as () => TreeNode, required: true },
    selectedUid: { type: String, default: '' },
    level: { type: Number, default: 0 },
  },
  emits: ['select'],
  setup(props, { emit }): () => VNode {
    const expanded = ref(true)
    return (): VNode => {
      const { node, selectedUid, level } = props
      const isSelected = selectedUid === node.uid
      const hasChildren = node.children.length > 0

      return h('div', { class: 'tree-item-wrapper' }, [
        h('div', {
          class: ['tree-node', { selected: isSelected }],
          style: { paddingLeft: `${level * 12}px` },
          onClick: () => emit('select', node.uid),
        }, [
          hasChildren
            ? h('span', {
                class: ['expand-icon', { expanded: expanded.value }],
                onClick: (e: MouseEvent) => { e.stopPropagation(); expanded.value = !expanded.value },
              }, '▸')
            : h('span', { class: 'expand-icon-placeholder' }),
          h('span', { class: 'node-name' }, node.name),
        ]),
        expanded.value && hasChildren
          ? h('div', null, node.children.map(child =>
              h(TreeItem, {
                key: child.uid,
                node: child,
                selectedUid,
                level: level + 1,
                onSelect: (uid: string) => emit('select', uid),
              }),
            ))
          : null,
      ])
    }
  },
})

const treeStructure = computed(() => {
  const root: TreeNode[] = []
  const uidToNode = new Map<string, TreeNode>()

  for (const [uid, nodes] of Object.entries(props.graph.components)) {
    const sentinel = nodes[0]
    if (!sentinel || sentinel.type !== 'component') continue
    const { path = '', name = '' } = sentinel
    uidToNode.set(uid, { uid, name, path, children: [] })
  }

  for (const [uid, nodes] of Object.entries(props.graph.components)) {
    const sentinel = nodes[0]
    if (!sentinel || sentinel.type !== 'component') continue
    const node = uidToNode.get(uid)!
    const parentUid = sentinel.parentUid
    if (parentUid === undefined) {
      root.push(node)
    } else {
      const parent = uidToNode.get(parentUid.toString())
      if (parent) parent.children.push(node)
      else root.push(node)
    }
  }

  return root
})
</script>

<template>
  <div class="component-tree">
    <div v-if="treeStructure.length === 0" class="empty-state">
      No components
    </div>
    <div v-else class="tree-list">
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
  overflow-y: auto;
  padding: 8px 0;
}

.empty-state {
  padding: 20px 10px;
  text-align: center;
  color: #4a5f7a;
  font-size: 12px;
}

.tree-list {
  width: 100%;
}

.tree-item-wrapper {
  width: 100%;
}

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

.tree-node:hover {
  background: #172030;
}

.tree-node.selected {
  background: #172030;
  color: #42d392;
  border-left: 2px solid #42d392;
  padding-left: 6px;
}

.expand-icon {
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #4a5f7a;
  transition: transform 0.15s;
  cursor: pointer;
  flex-shrink: 0;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

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

::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-thumb {
  background: #2a3f5c;
  border-radius: 2px;
}
</style>
