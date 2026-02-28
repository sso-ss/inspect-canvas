# PDR: figma-html-import

**Product Design Requirements — HTML/CSS → Figma Converter**

| Field | Value |
|-------|-------|
| Author | So Eun Ahn |
| Date | 2026-02-27 |
| Status | Draft |
| Related | [figma-unified-mcp](../figma-unified-mcp/) |

---

## 1. Problem Statement

Designers build in Figma, developers implement in code, and the two diverge over time. When a developer modifies a component in HTML/CSS (e.g., in a React app or Storybook), there is no automated way to reflect those changes back into Figma. The round-trip is broken:

```
Figma → (codegen) → HTML/CSS → (developer edits) → ???
                                                      ↑ gap
```

Manual re-creation in Figma is tedious, error-prone, and rarely done — leading to design–code drift.

---

## 2. Proposed Solution

A standalone Node.js library that parses HTML/CSS and converts it into Figma canvas commands, using the existing Plugin Bridge WebSocket protocol from `figma-unified-mcp`.

```
HTML/CSS string → Parser → CSS Resolver → Figma Command Mapper → batch commands → Plugin Bridge → Figma Plugin → Canvas
```

**This is a deterministic transformation — no LLM/MCP required.**

---

## 3. Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Convert structural HTML (divs, sections, headings, paragraphs, spans, images, buttons, inputs, lists) to Figma frames/text/rectangles | P0 |
| G2 | Map CSS flexbox to Figma auto-layout (direction, gap, padding, alignment) | P0 |
| G3 | Map visual CSS properties (colors, borders, border-radius, shadows, opacity, fonts) to Figma fills/strokes/effects | P0 |
| G4 | Preserve nesting hierarchy from DOM → Figma frame tree | P0 |
| G5 | Support inline styles, `<style>` blocks, and basic CSS selectors | P1 |
| G6 | Batch commands for performance (single `batch` call per component) | P1 |
| G7 | Work as CLI, library, and optional MCP tool wrapper | P1 |
| G8 | Handle CSS grid (basic 2D → Figma wrap auto-layout approximation) | P2 |
| G9 | Fetch and embed external images as image fills | P2 |
| G10 | Resolve external stylesheets (`<link>`) | P3 |

---

## 4. Non-Goals

- **Pixel-perfect rendering** — This is structural fidelity, not a browser screenshot. Figma auto-layout handles final sizing.
- **JavaScript execution** — No dynamic content, no React rendering. Input is static HTML/CSS.
- **CSS animations / transitions** — Ignored (no Figma equivalent).
- **Pseudo-elements** (`::before`, `::after`) — Out of scope for v1.
- **CSS `position: absolute/fixed`** — Best-effort; auto-layout takes precedence.
- **Full CSS cascade** — Specificity is simplified; inline > class > element in v1.
- **Replacing Claude→Figma** — This complements it; Claude handles intent, this handles code.

---

## 5. Architecture

### 5.1 System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  figma-html-import                       │
│                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  Parser   │──▶│ CSS Resolver  │──▶│ Figma Mapper   │  │
│  │(htmlparser2)  │ (css-tree)    │   │                │  │
│  └──────────┘   └──────────────┘   └───────┬────────┘  │
│                                            │            │
│                                     Command Array       │
│                                     (batch payload)     │
└────────────────────────────────────────────┬────────────┘
                                             │
                          ┌──────────────────▼──────────────┐
                          │  Plugin Bridge (WebSocket)       │
                          │  ws://localhost:3055              │
                          │  (from figma-unified-mcp)        │
                          └──────────────────┬───────────────┘
                                             │
                          ┌──────────────────▼──────────────┐
                          │  Figma Plugin (unchanged)        │
                          │  Executes: create_frame,         │
                          │  create_text, set_fill, etc.     │
                          └─────────────────────────────────┘
```

### 5.2 Module Breakdown

```
figma-html-import/
├── src/
│   ├── index.ts              ← Public API: htmlToFigma(), htmlToCommands()
│   ├── parser.ts             ← HTML string → DOM AST (htmlparser2)
│   ├── css-resolver.ts       ← Resolve styles: inline + <style> + defaults
│   ├── mapper.ts             ← AST node + resolved styles → Figma command(s)
│   ├── css-defaults.ts       ← Browser default styles (user-agent stylesheet)
│   ├── color-utils.ts        ← CSS color parsing (hex, rgb, rgba, named, hsl)
│   ├── unit-utils.ts         ← CSS unit conversion (px, rem, em, %, vw → px)
│   ├── bridge-client.ts      ← Lightweight WS client (or import from unified-mcp)
│   └── cli.ts                ← CLI entry: npx figma-html-import ./file.html
├── tests/
│   ├── parser.test.ts
│   ├── css-resolver.test.ts
│   ├── mapper.test.ts
│   └── e2e.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 6. CSS → Figma Property Mapping

### 6.1 Layout

| CSS | Figma | Notes |
|-----|-------|-------|
| `display: flex` | `autoLayout: "HORIZONTAL"` or `"VERTICAL"` | Based on `flex-direction` |
| `flex-direction: column` | `autoLayout: "VERTICAL"` | Default for `<div>` |
| `flex-direction: row` | `autoLayout: "HORIZONTAL"` | |
| `gap: 16px` | `itemSpacing: 16` | |
| `row-gap` / `column-gap` | `itemSpacing` / `counterAxisSpacing` | |
| `padding: 16px` | `paddingTop/Right/Bottom/Left: 16` | All 4 sides |
| `padding: 8px 16px` | `paddingTop/Bottom: 8, paddingLeft/Right: 16` | Shorthand |
| `justify-content: center` | `primaryAxisAlign: "CENTER"` | |
| `justify-content: space-between` | `primaryAxisAlign: "SPACE_BETWEEN"` | |
| `align-items: center` | `counterAxisAlign: "CENTER"` | |
| `flex-wrap: wrap` | `layoutWrap: "WRAP"` | |
| `width: 200px` | `width: 200` on frame | |
| `height: auto` | `primaryAxisSizing: "AUTO"` | |
| `width: 100%` | `layoutSizingHorizontal: "FILL"` | Figma "Fill container" |

### 6.2 Visual

| CSS | Figma | Target tool |
|-----|-------|------------|
| `background-color: #3B82F6` | `fillColor: {r:0.231, g:0.510, b:0.965}` | `set_fill` |
| `background: linear-gradient(...)` | Gradient fill | `set_fill` (extended) |
| `color: #1A1A1A` | Text fill color | `create_text` fills param |
| `border: 1px solid #E5E7EB` | `strokeColor + strokeWeight: 1` | `set_stroke` |
| `border-radius: 12px` | `cornerRadius: 12` | `set_corner_radius` |
| `border-radius: 8px 8px 0 0` | `rectangleCornerRadii: [8,8,0,0]` | `set_corner_radius` |
| `opacity: 0.5` | `opacity: 0.5` | `set_opacity` |
| `box-shadow: 0 4px 6px rgba(0,0,0,0.1)` | `effects: [{type:"DROP_SHADOW",...}]` | `set_effects` |
| `overflow: hidden` | `clipsContent: true` | `create_frame` |

### 6.3 Typography

| CSS | Figma | Notes |
|-----|-------|-------|
| `font-family: Inter` | `fontFamily: "Inter"` | Fallback: last available |
| `font-size: 16px` | `fontSize: 16` | |
| `font-weight: 700` | `fontWeight: 700` | or bold → 700 |
| `line-height: 1.5` | `lineHeight: {value: 150, unit: "PERCENT"}` | |
| `letter-spacing: 0.5px` | `letterSpacing: {value: 0.5, unit: "PIXELS"}` | |
| `text-align: center` | `textAlignHorizontal: "CENTER"` | |
| `text-transform: uppercase` | `textCase: "UPPER"` | |
| `text-decoration: underline` | `textDecoration: "UNDERLINE"` | |

### 6.4 HTML Elements → Figma Nodes

| HTML | Figma node | Default behavior |
|------|-----------|-----------------|
| `<div>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<main>` | Frame | auto-layout VERTICAL |
| `<span>`, `<a>`, `<strong>`, `<em>` | Text (inline, merged with parent text node) | Styled range |
| `<p>`, `<h1>`–`<h6>`, `<label>` | Text node | Block-level, named by tag |
| `<button>` | Frame + Text child | auto-layout HORIZONTAL, centered |
| `<input>`, `<textarea>` | Frame + Text child | Border, padding, placeholder text |
| `<img>` | Rectangle with image fill | `width`/`height` from attributes |
| `<ul>`, `<ol>` | Frame | auto-layout VERTICAL, itemSpacing: 8 |
| `<li>` | Frame (HORIZONTAL) | Bullet/number text + content |
| `<hr>` | Rectangle | height: 1, fill: gray, full width |
| `<br>` | Line break in text node | |
| `<table>` | Frame (VERTICAL) of row frames | Simplified grid |

---

## 7. API Design

### 7.1 Library API

```typescript
import { htmlToFigma, htmlToCommands } from 'figma-html-import';

// Full pipeline: parse + send to Figma
await htmlToFigma('<div style="display:flex; gap:16px">...</div>', {
  wsPort: 3055,           // Plugin bridge port (default: 3055)
  parentId: '123:456',    // Figma parent node to insert into (optional)
  baseFont: 'Inter',      // Default font family (default: Inter)
  baseFontSize: 16,       // Root font size for rem conversion (default: 16)
  scale: 1,               // Scale factor (default: 1)
});

// Commands only (no WebSocket, no side effects)
const commands = htmlToCommands('<button class="btn">Click me</button>', {
  styles: '.btn { background: #3B82F6; color: white; padding: 8px 16px; border-radius: 8px; }',
});
// Returns: FigmaCommand[] — ready to send via any bridge
```

### 7.2 CLI

```bash
# From file
npx figma-html-import ./component.html

# From stdin (pipe from other tools)
echo '<div style="padding:16px">Hello</div>' | npx figma-html-import

# With options
npx figma-html-import ./page.html --port 3055 --parent-id "1:2" --scale 2

# Dry run (print commands, don't send)
npx figma-html-import ./page.html --dry-run

# From URL (fetch + parse)
npx figma-html-import https://example.com/component.html --selector ".card"
```

### 7.3 Optional MCP Tool Wrapper

For integration back into `figma-unified-mcp` (so Claude can use it):

```typescript
// In figma-unified-mcp/src/tools/html-import.ts
server.tool(
  "figma_import_html",
  "Import HTML/CSS into Figma as native frames with auto-layout",
  {
    html: z.string().describe("HTML string to convert"),
    css: z.string().optional().describe("CSS styles to apply"),
    parentId: z.string().optional(),
  },
  async ({ html, css }) => {
    const commands = htmlToCommands(html, { styles: css });
    const result = await bridge.sendCommand("batch", { operations: commands });
    return toolSuccess(result);
  }
);
```

---

## 8. CSS Resolution Strategy

### Priority order (simplified cascade):

```
1. Inline styles              (highest — style="...")
2. <style> block rules         (matched by selector specificity)
3. HTML attribute defaults     (width="200", bgcolor="red")
4. User-agent defaults         (built-in — h1 is bold 32px, p has margin, etc.)
```

### Selector support (v1):

| Selector | Supported | Example |
|----------|-----------|---------|
| Element | ✅ | `div`, `p`, `h1` |
| Class | ✅ | `.card`, `.btn-primary` |
| ID | ✅ | `#header` |
| Descendant | ✅ | `.card p` |
| Child | ✅ | `.card > h2` |
| Multiple | ✅ | `.btn, .link` |
| Pseudo-class | ❌ v1 | `:hover`, `:first-child` |
| Pseudo-element | ❌ | `::before`, `::after` |
| Attribute | ❌ v1 | `[type="text"]` |
| Media query | ❌ v1 | `@media (max-width: ...)` |

---

## 9. Edge Cases & Decisions

| Case | Decision |
|------|----------|
| No `display` set on `<div>` | Default to `autoLayout: "VERTICAL"` (block behavior) |
| `display: inline` on `<span>` | Merge text content into parent text node as styled range |
| `display: none` | Skip node entirely |
| `visibility: hidden` | Create node with `visible: false` |
| `position: absolute` | Create frame, use `x`/`y` from `top`/`left` values, no auto-layout on parent |
| `position: fixed` | Treat same as absolute (Figma has no viewport concept) |
| Negative margins | Ignore (Figma doesn't support) |
| `z-index` | Affects child order in parent frame |
| `overflow: hidden` | `clipsContent: true` |
| `overflow: scroll` | `clipsContent: true` (no scroll behavior in Figma) |
| `text-overflow: ellipsis` | `textTruncation: "ENDING"` |
| `max-width` / `min-width` | `maxWidth` / `minWidth` on frame (Figma supports these) |
| Font not available | Fall back to "Inter", log warning |
| `rem` units | Convert using `baseFontSize` (default 16px) |
| `em` units | Convert using parent computed font-size |
| `%` widths | Convert to Figma "FILL" container mode where possible |
| `calc()` | Best-effort eval of simple expressions, skip complex |
| `var(--custom-prop)` | Resolve from `:root` or `<style>` declarations |
| Nested `<a>` inside text | Style as underline + color in text range |
| `<img>` with remote `src` | Download + embed as image fill (P2) or placeholder rectangle (v1) |
| `<svg>` inline | Skip in v1 (P3: convert to Figma vector) |
| Empty containers | Create frame anyway (may serve as spacer) |

---

## 10. Performance Targets

| Metric | Target |
|--------|--------|
| Parse + map a single component (~50 nodes) | < 50ms |
| Parse + map a full page (~500 nodes) | < 500ms |
| Batch command payload size | < 500KB per batch |
| Max nodes per batch | 200 (split into multiple batches if larger) |
| WebSocket round-trip (send + ack) | < 2s for 200-node batch |

---

## 11. Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `htmlparser2` | HTML parsing → AST | ~30KB |
| `css-tree` | CSS parsing + selector matching | ~80KB |
| `ws` | WebSocket client for plugin bridge | ~30KB |

**Total added weight: ~140KB** (no heavy deps like Puppeteer/Playwright)

Zero dependency on `@modelcontextprotocol/sdk`, Figma REST API, or any LLM.

---

## 12. Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit — Parser | HTML string → correct AST structure | Snapshot tests with known HTML |
| Unit — CSS Resolver | Style resolution, specificity, shorthand expansion | Property-level assertions |
| Unit — Mapper | AST node + styles → correct Figma commands | Golden file comparisons |
| Integration | Full pipeline: HTML → command array | Compare output against expected command arrays |
| E2E | HTML → actual Figma canvas (requires plugin running) | Visual regression with `figma_screenshot` |
| Fixtures | Common UI patterns: card, button, form, nav, hero | One fixture per pattern |

### Key test fixtures:

```
tests/fixtures/
├── button-simple.html         ← <button> with padding, bg, radius
├── card-flexbox.html          ← Card with flex column layout
├── form-inputs.html           ← Labels + inputs + button
├── nav-horizontal.html        ← Horizontal nav with flex row
├── grid-features.html         ← 3-column feature grid
├── nested-components.html     ← Deep nesting (4+ levels)
├── typography-scale.html      ← h1-h6. p, spans, strong, em
├── responsive-container.html  ← max-width centered wrapper
└── tailwind-card.html         ← Tailwind utility classes
```

---

## 13. Milestones

### v0.1 — Core Mapping (Week 1-2)
- [ ] HTML parser → AST 
- [ ] Inline style extraction
- [ ] Core mapper: div→frame, p/h→text, img→rectangle
- [ ] Flexbox → auto-layout (direction, gap, padding, alignment)
- [ ] Colors, borders, border-radius, opacity
- [ ] Basic typography (font-family, size, weight, color)
- [ ] Batch output format
- [ ] Unit tests for all mappers

### v0.2 — CSS Support (Week 3-4)
- [ ] `<style>` block parsing with css-tree
- [ ] Selector matching (element, class, ID, descendant, child)
- [ ] Shorthand expansion (margin, padding, border, background)
- [ ] CSS custom properties (`var(--x)` resolution)
- [ ] User-agent default styles
- [ ] `rem` / `em` / `%` unit conversion
- [ ] Box shadow → Figma drop shadow
- [ ] CLI tool (`npx figma-html-import`)

### v0.3 — Integration (Week 5-6)
- [ ] WebSocket bridge client
- [ ] End-to-end: HTML file → Figma canvas
- [ ] Stdin pipe support
- [ ] `--dry-run` mode (print commands)
- [ ] `--selector` flag (import specific element)
- [ ] Error reporting with source line numbers
- [ ] E2E tests with real Figma plugin

### v0.4 — Polish (Week 7-8)
- [ ] MCP tool wrapper for figma-unified-mcp
- [ ] Image download + embed (remote `src`)
- [ ] CSS grid → wrap auto-layout approximation
- [ ] Tailwind class resolution (common utilities)
- [ ] Performance optimization for large pages
- [ ] README + usage examples
- [ ] npm publish

---

## 14. Open Questions

| # | Question | Options | Leaning |
|---|----------|---------|---------|
| Q1 | Should Tailwind classes be supported natively? | (a) Yes, bundle Tailwind resolver (b) No, require pre-compiled CSS (c) Common utilities only | (c) — handle common flex/padding/color/text utilities, skip complex |
| Q2 | How to handle `<img src="remote-url">`? | (a) Download + base64 embed (b) Placeholder rectangle with URL label (c) Both with flag | (c) — default placeholder, `--fetch-images` flag to download |
| Q3 | Should the library auto-connect to plugin bridge? | (a) Yes, auto-discover port (b) No, require explicit config (c) Auto with fallback to dry-run | (c) — try connect, fall back to printing commands |
| Q4 | Monorepo with figma-unified-mcp or separate repo? | (a) Monorepo (shared plugin bridge code) (b) Separate repo | (b) — clean separation, import bridge client as dependency |
| Q5 | Support React JSX directly? | (a) Yes, parse JSX (b) No, require rendered HTML (c) Provide React helper that renders to string first | (c) — `renderToStaticMarkup()` + pipe to this tool |

---

## 15. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| A basic Tailwind card component HTML → Figma produces correct auto-layout frame tree | Manual verification |
| All 9 test fixtures import without errors | Automated test suite |
| Command output matches expected Figma structure ≥95% of nodes | Golden file diff |
| Full page (500 nodes) imports in under 3 seconds | Benchmark |
| Zero runtime dependency on MCP, LLM, or Figma REST API | Dependency audit |
