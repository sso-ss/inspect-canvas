# inspect-canvas — Feature Plan

## Phase 1 — Foundation ✅ Complete
**Plain HTML + CSS**

- [x] Proxy / local folder server
- [x] Click-to-inspect overlay injected into pages
- [x] Figma-style properties panel (color, typography, spacing, layout, radius, stroke)
- [x] Writes changes back to source HTML/CSS files
- [x] `.inspect-canvas.json` output for AI assistants (Copilot, Claude)

---

## Phase 2 — React + Tailwind CSS ✅ Complete
**Covers output from Claude, ChatGPT, v0, Lovable, Bolt — ~80% of target users.**

- [x] Vite plugin: inject `data-source="src/Hero.tsx:14"` into every JSX element at dev time
- [x] Babel plugin: same injection for webpack / CRA / Next.js Pages Router
- [x] AST source patcher: read `data-source` → parse file with `@babel/parser` → find JSX node → modify `className` or `style` prop → write back
- [x] Tailwind class mapper: CSS values → Tailwind classes (e.g. `18px` → `text-lg`, `#3B82F6` → `text-blue-500`)
- [x] Inline style fallback: when no Tailwind class matches, inject `style={{ ... }}`
- [x] Wired into `/__inspect/apply` endpoint — applies changes to `.tsx`/`.jsx` source files on Apply

**Deliverable:** Designer edits a React + Tailwind component visually → correct Tailwind class is written back to the `.tsx` source file. ✓

---

## Phase 3 — Next.js + Tailwind 🔜 Next
**Nearly identical to Phase 2 with two additions.**

- [ ] App Router: skip patching `"use server"` files, handle RSC boundaries
- [ ] HMR awareness: trigger hot reload correctly after source patch
- [ ] Pages Router: covered by Phase 2 Babel plugin

---

## Phase 4 — React + CSS Modules
- [ ] CSS module import tracer: detect `className={styles.hero}` → resolve the `.module.css` file
- [ ] CSS module patcher: update the correct rule in the resolved file (reuses existing CSS patch logic)

---

## Phase 5 — Vue + Tailwind
- [ ] Vite plugin: use `@vue/compiler-sfc` to inject `data-source` into `<template>` elements
- [ ] Vue SFC patcher: find the node in the `<template>` block → modify `class` or `:style` binding
- [ ] Scoped style patcher: patch matching rule in `<style scoped>` block

---

## Phase 6 — Polish & Ecosystem
- [ ] VS Code extension: properties panel inside VS Code sidebar
- [ ] Svelte support: use `svelte/compiler` for source injection and patching
- [ ] Undo history: step back through applied changes
- [ ] Diff preview: show git-style diff before saving to source
- [ ] Figma token import: read Figma variables and map to Tailwind config values
