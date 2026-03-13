import type { NodeType } from '../types/graph'

export const NODE_TYPE_META = {
  ref:       { label: 'ref',       color: '#4ade80', background: 'rgba(74,222,128,.08)',  border: 'rgba(74,222,128,.28)'  },
  reactive:  { label: 'reactive',  color: '#fb923c', background: 'rgba(251,146,60,.08)',  border: 'rgba(251,146,60,.28)'  },
  computed:  { label: 'computed',  color: '#60a5fa', background: 'rgba(96,165,250,.08)',  border: 'rgba(96,165,250,.28)'  },
  watch:     { label: 'watch',     color: '#c084fc', background: 'rgba(192,132,252,.08)', border: 'rgba(192,132,252,.28)' },
  component: { label: 'component', color: '#c084fc', background: 'rgba(192,132,252,.08)', border: 'rgba(192,132,252,.28)', hidden: true },
  store:     { label: 'store',     color: '#f472b6', background: 'rgba(244,114,182,.08)', border: 'rgba(244,114,182,.28)' },
  prop:      { label: 'prop',      color: '#2dd4bf', background: 'rgba(45,212,191,.08)',  border: 'rgba(45,212,191,.28)'  },
} as const satisfies Record<NodeType, object>

export const NODE_TYPES = (Object.keys(NODE_TYPE_META) as NodeType[])
  .filter(k => !(NODE_TYPE_META[k] as { hidden?: boolean }).hidden)
