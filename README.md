# ui-inspect

> A Figma-like browser inspector for designers and non-engineers.  
> Click any element → edit it visually → save changes back to your source code.

---

## Why I built this

AI tools like Claude, ChatGPT, v0, Lovable, and Bolt have made it incredibly easy for designers to generate code directly from Figma designs — no engineering background required.

But the output is rarely pixel-perfect on the first try. There are always small differences: a font size that's slightly off, padding that doesn't match, a colour that's close but not quite right.

Fixing these small things creates a painful loop:

1. Notice the difference in the browser
2. Try to find it in browser DevTools — a tool built for engineers, not designers
3. Figure out what CSS property to change and what value to use
4. Go back to the AI, describe the change in words
5. Regenerate the code, copy it back, hope it's right
6. Repeat

Designers who are fluent in Figma get completely lost in DevTools. The panels look nothing alike. The terminology is different. It's a tool that assumes you already know how to code.

**ui-inspect bridges that gap.**

It wraps your generated app in an inspector that looks and feels like Figma's right-hand panel. Click any element — and instead of raw computed CSS, you see familiar controls: colour swatches, font size, spacing, border radius, layout direction. Make a change, hit Apply, and it writes directly back to your source files. No DevTools. No code editing. No back-and-forth with an AI.

The goal is to let designers own that final 10% of polish themselves, without needing an engineer in the loop.

---

## Features

- **Figma-style properties panel** — Color picker, typography, spacing, layout, border radius, position, stroke
- **Click to select** — Click any element in the preview to inspect and edit it
- **Viewport presets** — Responsive preview with device presets (iPhone, iPad, desktop, full HD)
- **Two modes** — Proxy a running dev server (`http://localhost:5173`) or serve a local folder directly
- **Writes back to source** — Changes are patched directly into your HTML/CSS source files
- **AI-ready** — Writes `.ui-inspect.json` so AI assistants (GitHub Copilot, Claude) know exactly what element you selected and what you want changed

---

## Installation

```bash
npm install -g ui-inspect
# or without installing:
npx ui-inspect
```

---

## Usage

### Inspect a running dev server

```bash
ui-inspect http://localhost:5173
```

### Serve a local folder

```bash
ui-inspect ./my-project
```

### Options

```
ui-inspect <url-or-folder> [options]

  -p, --port <port>     Inspector server port (default: 3100)
  -o, --output <dir>    Directory to write .ui-inspect.json (default: cwd)
  --no-open             Don't open browser automatically
  -h, --help            Show help
```

### As a Node.js API

```ts
import { startInspectServer } from 'ui-inspect';

await startInspectServer({
  url: 'http://localhost:5173', // or localDir: './my-project'
  port: 3100,
  outputDir: './',
  openBrowser: true,
});
```

---

## How it works

1. **Open** — ui-inspect wraps your site in a shell with a floating inspector panel
2. **Click** — Click any element; the panel fills with its current properties
3. **Edit** — Adjust values directly in the panel (color picker, number inputs, dropdowns)
4. **Apply** — Hit Apply; changes are written back to your source HTML/CSS files
5. **AI assist** — A `.ui-inspect.json` file is written to your project root with the selected element's full details, so you can tell your AI "update this element" and it knows exactly what to change

---

## `.ui-inspect.json`

Every click updates this file:

```json
{
  "tag": "h1",
  "selector": ".hero > h1",
  "text": "Welcome to my site",
  "styles": {
    "fontSize": "48px",
    "color": "#1a1a2e",
    "fontWeight": "700"
  },
  "size": { "width": 640, "height": 72 },
  "position": { "x": 400, "y": 120 },
  "source": "src/Hero.tsx:14",
  "instruction": "Make the font size 56px and color #3B82F6",
  "timestamp": "2026-03-15T10:00:00.000Z"
}
```

AI tools read this file when you say *"update this element"* — they know the selector, current styles, source file, and your instruction.

---

## Roadmap

See [FEATURES.md](FEATURES.md) for the full phase plan.

- ✅ Phase 1 — Plain HTML + CSS (complete)
- 🔜 Phase 2 — React + Tailwind CSS
- Phase 3 — Next.js + Tailwind
- Phase 4 — React + CSS Modules
- Phase 5 — Vue + Tailwind
- Phase 6 — VS Code extension, Svelte, Figma token import

---

## Requirements

- Node.js 18+

---

## Author

So Eun Ahn

## License

MIT
