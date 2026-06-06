# Vue Reactivity Graph

> **English** | [繁體中文](./README.zh-TW.md)

A Chrome DevTools extension that visualizes the dependency graph between `ref` / `reactive` and `computed` / `watch` in a **Vue 3 dev-mode** app. It helps you see, at a glance, who depends on what in your reactive data flow — and which source file each variable comes from.

`Vue 3 dev mode` · `tested against Vue 3.5.x` · `Chrome MV3` · `Dev mode only` · `TypeScript`

> **TODO:** add a screenshot / GIF of the DevTools panel here.

---

## Features

- **Bidirectional dependency view** — for any dep (`ref` / `reactive`), see which subs (`computed` / `watch`) subscribe to it, and for any sub, see which deps it relies on.
- **Source file attribution** — each variable shows the file it comes from (e.g. `CartPanel.vue`, `useCart.js`).
- **Props / inject / Pinia support** — tracks `props`, `provide` / `inject`, and Pinia `storeToRefs` relationships, not just local state.
- **Read-only** — it reads and records reactivity metadata; it does not change your application logic. (But see the important caveat below about how dependency collection works.)

---

## Requirements & Limitations

**Hard requirements**

- Vue 3 only — **Vue 2 is not supported**.
- **Dev mode only** — a production build strips the internals this tool reads.
- A Chromium-based browser (Chrome, Edge, …) with DevTools.

**Known limitations** (each links to the detailed note)

- Nested reactive objects inside `v-bind="obj"` are **not tracked recursively** — see [docs/tracking/props.md](./docs/tracking/props.md).
- Multiple `v-bind` on one element are merged via `mergeProps` and follow a different code path — see [docs/tracking/props.md](./docs/tracking/props.md).
- An injected value wrapped inside a composable, whose raw value never reaches `setupState`, will not get an inject node — see [docs/tracking/inject.md](./docs/tracking/inject.md).

---

## ⚠️ Important — side effects on your running app

> **To collect the dependency graph, this extension actively re-evaluates your `computed` getters and re-runs your `watch` effects during its scan.**
>
> - For each `computed`, it forces the value dirty (mutating `flags` and `globalVersion`) and reads `.value`, which **re-runs the computed getter** — see [`src/injected/subscribers/computed.ts`](./src/injected/subscribers/computed.ts).
> - For each `watch`, it calls `effect.run()`, so **the watch source / effect runner may be re-run** — see [`src/injected/subscribers/watch.ts`](./src/injected/subscribers/watch.ts).
>
> **Why this is hard to avoid:** Vue's `onTrack` only reports a dependency when a reactive value is actually read, so the graph cannot be built without reading those values at least once. See the `onTrack` limitation in [DESIGN_NOTES.md](./DESIGN_NOTES.md).
>
> **Consequences:** if a getter or watch source is **impure** (performs side effects — network calls, mutating external state, counters, etc.), it may be executed one extra time, which can lead to unexpected behavior. Resetting `globalVersion` may also cause other computeds to recompute.
>
> **Recommendation:** use this extension in **dev mode only**, never in production. If your `computed` / `watch` have side effects, expect them to run an extra time when the extension scans.

---

## Install (from source)

This extension is not published to a store yet; build it from source:

1. `pnpm install`
2. `pnpm build` — outputs the unpacked extension to `dist/`.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and select the `dist/` folder.
5. Open the DevTools (F12) on a page running a Vue 3 dev build, and switch to the **Vue Reactivity Graph** panel.

---

## Usage

1. Open a page that runs a **Vue 3 dev build**.
2. Open DevTools and select the **Vue Reactivity Graph** panel.
3. Pick a variable from the **variable list** on the left.
4. The **graph view** on the right shows its upstream (deps) and downstream (subs), with each node labeled by type and source file.

---

## How it works

The extension spans three isolated browser environments: an **injected script** runs in the page's main world to read `__vue_app__` internals, a **content script** bridges to the **background script**, which forwards updates to the **DevTools panel**.

Dependency resolution happens in two phases — Phase 1 (`collectInstance`) builds nodes without triggering subscriptions, and Phase 2 (`triggerInstance`) attaches `onTrack` hooks and fills in the dependency edges.

For the full picture, see:

- [ARCHITECTURE.md](./ARCHITECTURE.md) — environment layers, data-flow timing, Phase 1 / Phase 2 diagrams.
- [DESIGN_NOTES.md](./DESIGN_NOTES.md) — `onTrack` limitations and the per-type tracking strategy index.
- [docs/tracking/](./docs/tracking/) — detailed strategy notes for setup-state, props, inject, and Pinia.

---

## Development

| Command | Description |
|---|---|
| `pnpm dev` | Watch-mode build (rebuilds on change). |
| `pnpm build` | One-off build to `dist/`. |
| `pnpm typecheck` | Type check with `vue-tsc` (no emit). |
| `pnpm test` | Run all unit tests (`vitest run`). |

Tests live in `src/injected/__tests__/*.test.ts`. Run a single file with:

```bash
pnpm vitest run src/injected/__tests__/props.test.ts
```

**Tech stack:** Vue 3 + Vite + TypeScript + pnpm, with [@vue-flow/core](https://github.com/bcakmakoglu/vue-flow) and [@dagrejs/dagre](https://github.com/dagrejs/dagre) for graph layout, and Pinia for store tracking.

---

## Project structure

A condensed map of the source — see [CLAUDE.md](./CLAUDE.md) for the full file-by-file breakdown.

| Area | Responsibility |
|---|---|
| `src/injected/` | Runs in the page's main world: walks the Vue component tree, builds nodes, and binds `onTrack` hooks. |
| `src/graph/` | Pure types and the global graph state (`GraphData`, `GraphNode`, `ComponentMeta`). |
| `src/panel/` | The DevTools panel UI — variable list, graph view (Vue Flow), and layout. |
| `src/content/`, `src/background/`, `src/devtools/` | The messaging bridge between the page and the panel. |

---

## Troubleshooting

| Symptom | What to check |
|---|---|
| The DevTools panel doesn't appear | Make sure the unpacked extension is loaded and pointed at `dist/`, then close and reopen DevTools. |
| The graph is empty / no nodes | Confirm the inspected page is a **Vue 3 dev build** — a production build exposes no internals to read. |
| Data doesn't update | Reload the inspected page, or close and reopen DevTools. |

---

## Contributing

Contributions are welcome. This project is intended to be open source, so please keep these principles in mind:

- **Avoid monkey-patching** Vue's reactive objects unless there is a strong, documented reason.
- **Design types for readability** — a contributor should be able to understand the intent quickly, not just confirm that there are no bugs today.
- **Document intrusive operations** — anything that attaches to or mutates Vue internals needs a clear explanation (or a cleaner alternative).

For the agent-driven development workflow and internal engineering notes, see [CLAUDE.md](./CLAUDE.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [DESIGN_NOTES.md](./DESIGN_NOTES.md).

> **TODO:** a dedicated `CONTRIBUTING.md` is planned.

---

## License

[MIT](./LICENSE) © Allen
