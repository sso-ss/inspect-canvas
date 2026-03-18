/**
 * inspect-canvas — Preview Server
 *
 * Shell page with viewport controls + iframe that loads proxied content.
 * All target requests are routed through /__proxy/ so sub-resources work.
 * Injects an inspector overlay into HTML pages.
 * Click any element → writes .inspect-canvas.json so AI assistants know what you're pointing at.
 */

import express from "express";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import type { InspectData, InspectServerOptions } from "./types.js";
import { patchJsxSource } from "./phase2/ast-source-patcher.js";
import { cssToTailwind, getConflictingClasses } from "./phase2/tailwind-mapper.js";
import { detectNextProject } from "./phase3/next-detector.js";
import { patchNextJsSource } from "./phase3/next-patcher.js";

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
}

async function tryApplyToJsx(
  sourceRef: string,
  overrides: Record<string, string>,
  projectRoot: string
): Promise<void> {
  const match = sourceRef.match(/^(.+\.(tsx|jsx)):(\d+)$/);
  if (!match) {
    console.warn(`  ⚠ data-source format unrecognised: ${sourceRef}`);
    return;
  }

  const [, relativePath, , lineStr] = match;
  // If the path is already absolute, resolve() returns it as-is
  const filePath = relativePath.startsWith('/') ? relativePath : resolve(projectRoot, relativePath);
  const line = parseInt(lineStr, 10);

  try { statSync(filePath); } catch { console.warn(`  ⚠ Source file not found: ${filePath}`); return; }

  const addClasses: string[] = [];
  const removeClasses: string[] = [];
  const setStyles: Record<string, string> = {};

  for (const [camelProp, value] of Object.entries(overrides)) {
    const cssProp = camelToKebab(camelProp);
    const twClass = cssToTailwind(cssProp, value);
    if (twClass) {
      addClasses.push(twClass);
      removeClasses.push(...getConflictingClasses(cssProp));
    } else {
      setStyles[camelProp] = value;
    }
  }

  // ── Phase 3: route Next.js projects through the Next.js-aware patcher ──
  const nextInfo = detectNextProject(projectRoot);
  if (nextInfo.isNextJs) {
    const result = await patchNextJsSource({
      filePath, line, addClasses, removeClasses, setStyles, projectRoot,
    });
    if (!result.ok) {
      console.warn(`  ⚠ Next.js patch skipped (${result.reason}): ${result.message}`);
      return;
    }
    const hmrNote = result.hmrNotified ? " (HMR notified)" : "";
    console.log(`  ✎ Patched Next.js JSX: ${relativePath}:${line}${hmrNote}`);
    return;
  }

  // ── Phase 2: plain React / non-Next.js ──────────────────────────────────
  const patched = patchJsxSource({ filePath, line, addClasses, removeClasses, setStyles });
  writeFileSync(filePath, patched);
  console.log(`  ✎ Patched JSX: ${relativePath}:${line}`);
}

export async function startInspectServer(options: InspectServerOptions): Promise<void> {
  const {
    url,
    localDir,
    localFile,
    port = 3100,
    outputDir = localDir ?? process.cwd(),
    openBrowser = true,
  } = options;

  if (!url && !localDir) {
    throw new Error("Either url or localDir must be provided");
  }

  const serveUrl = url ?? `http://localhost:${port}`;
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Persisted style overrides keyed by CSS selector
  const persistedOverrides = new Map<string, Record<string, string>>();

  // ─── Shell page: toolbar + viewport iframe ───────────────────────────
  app.get("/", (_req, res) => {
    res.type("html").send(getShellHtml(serveUrl, port, !!localDir));
  });

  // ─── API: Receive selected element data, write .inspect-canvas.json ──────
  app.post("/__inspect/select", (req, res) => {
    try {
      const data: InspectData = req.body;
      if (!data || !data.selector) {
        res.status(400).json({ error: "Missing element data" });
        return;
      }
      data.timestamp = new Date().toISOString();
      const outPath = resolve(outputDir, ".inspect-canvas.json");
      writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log(`  ✓ Selected: <${data.tag}> ${data.text ? '"' + data.text.slice(0, 40) + '"' : ''}`);
      res.json({ ok: true, path: outPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Persist overrides to memory (no file write, no reload) ───────────
  app.post("/__inspect/persist", (req, res) => {
    try {
      const { selector, overrides } = req.body;
      if (!selector || !overrides) {
        res.status(400).json({ error: "Missing selector or overrides" });
        return;
      }
      const cssOverrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(overrides)) {
        if (!k.startsWith('_') && typeof v === 'string') cssOverrides[k] = v;
      }
      if (Object.keys(cssOverrides).length > 0) {
        persistedOverrides.set(selector, {
          ...(persistedOverrides.get(selector) || {}),
          ...cssOverrides,
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Apply style overrides to .inspect-canvas.json ──────────────────
  app.post("/__inspect/apply", async (req, res) => {
    try {
      const { overrides } = req.body;
      if (!overrides) {
        res.status(400).json({ error: "Missing overrides" });
        return;
      }
      const outPath = resolve(outputDir, ".inspect-canvas.json");
      let data: InspectData;
      try {
        data = JSON.parse(readFileSync(outPath, "utf-8"));
      } catch {
        res.status(400).json({ error: "No element selected yet" });
        return;
      }
      // Merge overrides into styles
      data.styles = { ...data.styles, ...overrides };
      data.timestamp = new Date().toISOString();
      data.instruction = "Apply these style changes to the element";
      writeFileSync(outPath, JSON.stringify(data, null, 2));
      // Persist overrides so they survive page reloads
      if (data.selector) {
        persistedOverrides.set(data.selector, {
          ...(persistedOverrides.get(data.selector) || {}),
          ...overrides,
        });
      }
      // Write overrides to source HTML files (Phase 1: plain HTML/CSS)
      writeOverridesToSourceHtml(outputDir, persistedOverrides);

      // Phase 2/3: patch JSX source directly if data-source points to a .tsx/.jsx file
      if (data.source) {
        // Strip internal keys that aren't CSS properties (e.g. _hoverStyles)
        const jsxOverrides: Record<string, string> = {};
        for (const [k, v] of Object.entries(overrides)) {
          if (!k.startsWith('_') && typeof v === 'string') jsxOverrides[k] = v;
        }
        console.log(`  → Patching source: ${data.source}`);
        console.log(`  → Overrides: ${JSON.stringify(jsxOverrides)}`);
        try {
          await tryApplyToJsx(data.source, jsxOverrides, outputDir);
        } catch (err: any) {
          console.warn(`  ⚠ JSX patch error: ${err.message}`);
        }
      } else {
        console.warn(`  ⚠ No data-source on selected element — JSX patch skipped`);
      }

      console.log(`  ✎ Applied overrides to <${data.tag}>`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Local folder mode: serve files directly from disk ───────────────
  if (localDir) {
    app.use("/__proxy", (req, res) => {
      let defaultFile = localFile ?? "index.html";
      // If default file doesn't exist, pick the first .html file in the directory
      if (!localFile) {
        const defaultPath = resolve(localDir, defaultFile);
        try { statSync(defaultPath); } catch {
          const htmlFiles = readdirSync(localDir).filter(f => f.endsWith(".html"));
          if (htmlFiles.length > 0) defaultFile = htmlFiles[0];
        }
      }
      const urlPath = req.path === "/" ? "/" + defaultFile : req.path;
      const filePath = resolve(localDir, "." + urlPath);
      try {
        const fileContent = readFileSync(filePath);
        const ext = extname(filePath).toLowerCase();
        if (ext === ".html") {
          let html = fileContent.toString("utf-8");
          const inspectorScript = getInspectorScript(port);
          if (html.includes("</body>")) {
            html = html.replace("</body>", `${inspectorScript}\n</body>`);
          } else if (html.includes("</html>")) {
            html = html.replace("</html>", `${inspectorScript}\n</html>`);
          } else {
            html += inspectorScript;
          }
          res.setHeader("Cache-Control", "no-store");
          res.type("html").send(html);
        } else {
          res.sendFile(filePath);
        }
      } catch {
        res.status(404).send("Not found");
      }
    });
  } else {
  // ─── Reverse proxy under /__proxy/ ───────────────────────────────────
  app.use("/__proxy", async (req, res) => {
    try {
      const target = new URL(url!);
      // Strip the /__proxy prefix; default to "/" if nothing remains
      const rawPath = req.originalUrl.replace(/^\/__proxy/, '') || '/';
      let targetUrl: URL;
      try {
        targetUrl = new URL(rawPath, target.origin);
      } catch {
        res.status(400).type("text/plain").send(`Proxy error: could not resolve path "${rawPath}"`);
        return;
      }

      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key === "host" || key === "connection" || key === "upgrade") continue;
        if (typeof value === "string") headers[key] = value;
      }
      headers["host"] = target.host;

      const response = await fetch(targetUrl.toString(), {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
        redirect: "follow",
      });

      res.status(response.status);
      const STRIP_HEADERS = new Set([
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "content-length",
        "content-encoding",
        "transfer-encoding",
      ]);
      response.headers.forEach((value, key) => {
        if (!STRIP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        let html = await response.text();
        // Rewrite asset URLs to go through /__proxy/
        html = html.replace(/(src|href|action)=(["'])\//g, '$1=$2/__proxy/');
        // Inject persisted style overrides
        if (persistedOverrides.size > 0) {
          let css = '<style id="inspect-canvas-overrides">\n';
          for (const [sel, props] of persistedOverrides) {
            css += `${sel} {\n`;
            for (const [k, v] of Object.entries(props)) {
              if (k.startsWith('_') || typeof v !== 'string') continue;
              const prop = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
              css += `  ${prop}: ${v} !important;\n`;
            }
            css += '}\n';
          }
          css += '</style>\n';
          if (html.includes('</head>')) {
            html = html.replace('</head>', `${css}</head>`);
          } else {
            html = css + html;
          }
        }
        // Inject inspector script
        const inspectorScript = getInspectorScript(port);
        if (html.includes("</body>")) {
          html = html.replace("</body>", `${inspectorScript}\n</body>`);
        } else if (html.includes("</html>")) {
          html = html.replace("</html>", `${inspectorScript}\n</html>`);
        } else {
          html += inspectorScript;
        }
        res.setHeader("Cache-Control", "no-store");
        res.type("html").send(html);
      } else {
        // Non-HTML response (JS, CSS, images, etc.)
        // For error status codes with no content-type, force text/plain so
        // the browser renders them instead of triggering a file download.
        if (response.status >= 400 && !contentType) {
          res.type("text/plain");
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      }
    } catch (err: any) {
      if (err.cause?.code === "ECONNREFUSED") {
        res.status(502).type("html").send(`
          <html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f8fafc">
            <h1>Waiting for dev server...</h1>
            <p style="color:#94a3b8;margin-top:8px">Cannot reach <code>${url}</code></p>
            <p style="color:#64748b;margin-top:16px">Start your dev server, then refresh this page.</p>
            <script>setTimeout(() => location.reload(), 2000)</script>
          </body></html>
        `);
      } else {
        console.error(`  ✗ Proxy error [${req.method} ${req.originalUrl}]: ${err.message}`);
        res.status(502).type("text/plain").send(`Proxy error: ${err.message}`);
      }
    }
  });
  } // end localDir else block

  // ─── Catch-all: redirect leaked absolute URLs to /__proxy/ ───────────
  app.use((req, res) => {
    res.redirect(307, "/__proxy" + req.originalUrl);
  });

  // ─── Start ───────────────────────────────────────────────────────────
  return new Promise<void>((_resolve) => {
    const server = app.listen(port, async () => {
      console.log(`\n  🔍 inspect-canvas running at http://localhost:${port}`);
      if (localDir) {
        console.log(`  Serving: ${localDir}${localFile ? '/' + localFile : ''}\n`);
      } else {
        console.log(`  Proxying: ${url}\n`);
      }
      console.log(`  Select any element in the browser`);
      console.log(`  Then ask your AI: "update this element"\n`);

      if (openBrowser) {
        try {
          const open = (await import("open")).default;
          await open(`http://localhost:${port}`);
        } catch {
          console.log(`  Open http://localhost:${port} in your browser`);
        }
      }
    });

    server.ref();
    const keepAlive = setInterval(() => {}, 1 << 30);

    const shutdown = () => {
      clearInterval(keepAlive);
      server.close();
      _resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// ─── Source file patching helpers ─────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', '.cache', 'coverage', '.svelte-kit']);

function findHtmlFiles(dir: string): string[] {
  const results: string[] = [];
  function scan(current: string) {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = resolve(current, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        scan(full);
      } else if (name.endsWith('.html')) {
        results.push(full);
      }
    }
  }
  scan(dir);
  return results;
}

// CSS shorthand alternatives: if the override property isn't found directly,
// also check if a shorthand exists in the rule that covers the property.
const SHORTHAND_ALTS: Record<string, string[]> = {
  'background-color': ['background'],
  'border-width':     ['border'],
  'border-color':     ['border'],
  'border-style':     ['border'],
  'border-top-left-radius':     ['border-radius'],
  'border-top-right-radius':    ['border-radius'],
  'border-bottom-left-radius':  ['border-radius'],
  'border-bottom-right-radius': ['border-radius'],
};

function camelToDash(s: string): string {
  return s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
}

/**
 * Patches CSS rules inside <style> blocks for the given selector.
 * Returns { html, unhandled } — the caller is responsible for writing
 * a combined override block for ALL selectors' unhandled properties.
 */
function patchCssInHtml(
  html: string,
  selector: string,
  overrides: Record<string, string>
): { html: string; unhandled: Record<string, string> } {
  // Extract tag + classes from last combinator segment of selector
  const lastSeg = selector.split(/\s*[>+~]\s*/).pop()?.trim() ?? selector;
  const tagM = lastSeg.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const elementTag = tagM?.[1].toLowerCase() ?? null;
  const elementClasses = [...lastSeg.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]);

  // Convert camelCase override keys to dash-case, skipping internal/non-string values
  const dashOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    dashOverrides[camelToDash(k)] = v;
  }

  const handled = new Set<string>();

  // Patch rules inside non-override <style> blocks
  let result = html.replace(
    /(<style(?!\s+id="inspect-canvas-overrides")[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, openTag: string, cssText: string, closeTag: string) => {
      const updated = cssText.replace(
        /([ \t]*)((?:[^{}]|\n)+?)\{((?:[^{}]|\n)*?)\}/g,
        (_r: string, indent: string, selPart: string, declPart: string) => {
          // Does this rule apply to our element?
          const ruleSelectors = selPart.split(',').map((s: string) => s.trim());
          const matches = ruleSelectors.some((ruleSel: string) => {
            if (/:(hover|focus|active|visited|disabled|checked)/i.test(ruleSel)) return false;
            const ruleClasses = [...ruleSel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]);
            const ruleTagM = ruleSel.trim().match(/^([a-zA-Z][a-zA-Z0-9]*)/);
            const ruleTag = ruleTagM?.[1].toLowerCase() ?? null;
            return elementClasses.some(c => ruleClasses.includes(c)) ||
                   (elementTag !== null && ruleTag === elementTag && elementClasses.length === 0);
          });
          if (!matches) return `${indent}${selPart}{${declPart}}`;

          let newDecl = declPart;
          for (const [prop, val] of Object.entries(dashOverrides)) {
            // Build list of property names to search for (longhand + shorthands)
            const candidates = [prop, ...(SHORTHAND_ALTS[prop] ?? [])];
            const pattern = candidates.map(c => c.replace(/[-]/g, '\\-')).join('|');
            const searchRe = new RegExp(`(?<![\\w-])(${pattern})\\s*:[^;\\n]*`, 'g');
            if (searchRe.test(newDecl)) {
              handled.add(prop);
              newDecl = newDecl.replace(
                new RegExp(`(?<![\\w-])(${pattern})\\s*:[^;\\n]*`, 'g'),
                `$1: ${val}`
              );
            }
          }
          return `${indent}${selPart}{${newDecl}}`;
        }
      );
      return `${openTag}${updated}${closeTag}`;
    }
  );

  // Collect properties not found in any existing CSS rule
  const unhandled: Record<string, string> = {};
  for (const [prop, val] of Object.entries(dashOverrides)) {
    if (!handled.has(prop)) unhandled[prop] = val;
  }

  return { html: result, unhandled };
}

function writeOverridesToSourceHtml(dir: string, overrides: Map<string, Record<string, string>>): void {
  if (overrides.size === 0) return;
  const htmlFiles = findHtmlFiles(dir);
  for (const file of htmlFiles) {
    try {
      let html = readFileSync(file, 'utf-8');

      // Remove old combined override block once, before processing selectors
      html = html.replace(/<style\s+id="inspect-canvas-overrides">[\s\S]*?<\/style>\n?/g, '');

      // Patch each selector, collecting unhandled properties
      const allUnhandled = new Map<string, Record<string, string>>();
      for (const [selector, props] of overrides) {
        const result = patchCssInHtml(html, selector, props);
        html = result.html;
        if (Object.keys(result.unhandled).length > 0) {
          allUnhandled.set(selector, result.unhandled);
        }
      }

      // Write ONE combined override block for all selectors
      if (allUnhandled.size > 0) {
        let css = '<style id="inspect-canvas-overrides">\n';
        for (const [sel, props] of allUnhandled) {
          css += `  ${sel} {\n`;
          for (const [prop, val] of Object.entries(props)) {
            css += `    ${prop}: ${val} !important;\n`;
          }
          css += `  }\n`;
        }
        css += '</style>';
        html = html.includes('</head>')
          ? html.replace('</head>', `${css}\n</head>`)
          : html + '\n' + css;
      }

      writeFileSync(file, html);
      console.log(`  ✎ Patched source: ${file}`);
    } catch (err: any) {
      console.error(`  ✗ Could not patch ${file}: ${err.message}`);
    }
  }
}

// ─── Shell page with viewport controls ────────────────────────────────────

function getShellHtml(targetUrl: string, serverPort: number, _isLocal = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>inspect-canvas</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #1e1e1e; }

  .viewport-area {
    display: flex; justify-content: center; align-items: flex-start;
    width: 100%; height: 100vh; overflow: auto; padding: 0;
    background: #1e1e1e;
  }
  .viewport-area.responsive-mode { padding: 16px; }

  .frame-wrapper {
    position: relative; width: 100%; height: 100%;
    background: #fff; transition: width 0.2s ease, height 0.2s ease;
  }
  .viewport-area.responsive-mode .frame-wrapper {
    box-shadow: 0 0 0 1px #555;
    height: calc(100vh - 32px);
  }

  iframe { width: 100%; height: 100%; border: none; display: block; background: #fff; }

  /* Drag overlay to prevent iframe from stealing mouse events */
  #dragOverlay {
    display: none; position: fixed; top: 0; left: 0;
    width: 100%; height: 100%; z-index: 2147483646; cursor: grabbing;
  }

  /* ── Floating panel ── */
  #uiPanel {
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
    background: #64748b; color: #fff; border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    overflow: hidden; user-select: none; transition: background 0.2s ease;
    max-height: calc(100vh - 20px); display: flex; flex-direction: column;
  }
  #uiPanel.dragging { transition: none; }
  #uiToggle {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; cursor: grab; font-weight: 600; color: #fff;
  }
  #uiToggle:active { cursor: grabbing; }
  .toggle-switch {
    position: relative; width: 32px; height: 18px;
    background: #484f58; border-radius: 9px; cursor: pointer;
    transition: background 0.2s ease; flex-shrink: 0;
  }
  .toggle-switch.on { background: #6C5CE7; }
  .toggle-switch::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; background: #fff; border-radius: 50%;
    transition: transform 0.2s ease;
  }
  .toggle-switch.on::after { transform: translateX(14px); }
  #uiDimRow {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 12px 8px 12px; border-top: 1px solid #21262d;
  }
  #uiDimRow select {
    background: #161b22; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 4px; padding: 2px 4px; font-size: 11px;
    font-family: inherit; cursor: pointer; outline: none; flex: 1; min-width: 0;
  }
  #uiDimRow select:focus { border-color: #6C5CE7; }
  #uiDimRow input[type=number] {
    width: 48px; background: #161b22; color: #c9d1d9;
    border: 1px solid #30363d; border-radius: 4px; padding: 2px 4px;
    font-size: 11px; text-align: center; outline: none;
    font-family: 'SF Mono', Consolas, monospace;
  }
  #uiDimRow input[type=number]:focus { border-color: #6C5CE7; }
  #uiDimRow .x-label { color: #484f58; font-size: 10px; }
  #uiDimRow .swap-btn {
    background: #161b22; color: #8b949e; border: 1px solid #30363d;
    border-radius: 4px; width: 22px; height: 22px; cursor: pointer;
    font-size: 11px; display: flex; align-items: center; justify-content: center;
    padding: 0; flex-shrink: 0;
  }
  #uiDimRow .swap-btn:hover { color: #c9d1d9; border-color: #484f58; }
  #uiStatus {
    display: none; padding: 6px 12px; border-top: 1px solid #21262d;
    font-size: 11px; color: #8b949e; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  #uiStatus .el-tag { color: #a29bfe; font-family: 'SF Mono', Consolas, monospace; }
  #uiStatus { cursor: pointer; }
  #uiStatus:hover { background: #161b22; }
  #propsPanel {
    display: none; padding: 0 12px 10px; border-top: 1px solid #21262d;
    overflow-y: auto; user-select: auto; min-height: 0; flex: 1;
  }
  #propsPanel.open { display: block; }
  #propsPanel::-webkit-scrollbar { width: 4px; }
  #propsPanel::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
  .prop-section { padding-top: 8px; padding-bottom: 8px; }
  .prop-section + .prop-section { border-top: 1px solid #161b22; margin-top: 4px; }
  .prop-section-title {
    color: #6e7681; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 5px; font-weight: 600;
  }
  .prop-row {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 4px; min-height: 22px;
  }
  .prop-label { color: #8b949e; font-size: 11px; min-width: 52px; flex-shrink: 0; }
  .prop-value {
    color: #c9d1d9; font-size: 11px;
    font-family: 'SF Mono', Consolas, monospace;
  }
  .color-swatch {
    width: 22px; height: 22px; border-radius: 4px;
    border: 1px solid #30363d; flex-shrink: 0;
    cursor: pointer; position: relative;
    background-image: linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%);
    background-size: 8px 8px;
    background-position: 0 0,0 4px,4px -4px,-4px 0;
    background-color: #333;
  }
  .color-swatch-inner {
    position: absolute; inset: 0; border-radius: 3px;
  }

  /* ── Color picker popup ── */
  .cp-popup {
    display: none; position: fixed; z-index: 2147483648;
    background: #1c2128; border: 1px solid #30363d; border-radius: 10px;
    padding: 12px; width: 220px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .cp-popup.open { display: block; }
  .cp-grad {
    width: 196px; height: 160px; border-radius: 6px;
    position: relative; cursor: crosshair; margin-bottom: 10px;
    overflow: hidden;
  }
  .cp-grad canvas { display: block; width: 100%; height: 100%; border-radius: 6px; }
  .cp-grad-thumb {
    position: absolute; width: 12px; height: 12px;
    border-radius: 50%; border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
    transform: translate(-50%,-50%); pointer-events: none;
  }
  .cp-slider-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .cp-eyedrop { width: 22px; height: 22px; flex-shrink: 0;
    background: none; border: 1px solid #30363d; border-radius: 5px;
    color: #8b949e; cursor: pointer; font-size: 12px;
    display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .cp-eyedrop:hover { color: #c9d1d9; border-color: #484f58; }
  .cp-sliders { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .cp-hue, .cp-alpha {
    width: 100%; height: 10px; border-radius: 5px;
    -webkit-appearance: none; appearance: none; outline: none; cursor: pointer;
    border: none; padding: 0;
  }
  .cp-hue {
    background: linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
  }
  .cp-hue::-webkit-slider-thumb, .cp-alpha::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    border-radius: 50%; border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4); cursor: pointer;
    background: transparent;
  }
  .cp-hex-row { display: flex; gap: 6px; align-items: center; }
  .cp-hex-label { color: #6e7681; font-size: 10px; min-width: 22px; text-align: center; }
  .cp-hex-input {
    flex: 1; background: #161b22; color: #c9d1d9;
    border: 1px solid #30363d; border-radius: 5px;
    padding: 4px 6px; font-size: 11px; outline: none;
    font-family: \'SF Mono\', Consolas, monospace; text-transform: uppercase;
  }
  .cp-hex-input:focus { border-color: #6C5CE7; }
  .cp-alpha-input {
    width: 44px; background: #161b22; color: #c9d1d9;
    border: 1px solid #30363d; border-radius: 5px;
    padding: 4px 4px; font-size: 11px; outline: none; text-align: center;
    font-family: \'SF Mono\', Consolas, monospace;
  }
  .cp-alpha-input:focus { border-color: #6C5CE7; }
  .cp-percent { color: #6e7681; font-size: 11px; }
  .prop-num {
    width: 60px; background: #161b22; color: #c9d1d9;
    border: 1px solid #30363d; border-radius: 4px;
    padding: 2px 4px; font-size: 11px; text-align: center; outline: none;
    font-family: 'SF Mono', Consolas, monospace;
  }
  .prop-num:focus { border-color: #6C5CE7; }
  .prop-num::placeholder { color: #484f58; font-style: italic; }
  .unit-label { color: #484f58; font-size: 10px; flex-shrink: 0; }
  .prop-select {
    background: #161b22; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 4px; padding: 2px 4px; font-size: 11px;
    font-family: inherit; cursor: pointer; outline: none;
  }
  #resetBtn {
    flex: 1; background: #21262d; color: #8b949e;
    border: 1px solid #30363d; border-radius: 6px; padding: 6px 8px;
    font-size: 11px; cursor: pointer; font-family: inherit;
    transition: all 0.15s ease;
  }
  #resetBtn:hover { color: #c9d1d9; border-color: #484f58; }
  #applyBtn {
    flex: 2; background: #6C5CE7; color: #fff;
    border: 1px solid #5a4bd1; border-radius: 6px; padding: 6px 8px;
    font-size: 11px; cursor: pointer; font-family: inherit; font-weight: 600;
    transition: all 0.15s ease;
  }
  #applyBtn:hover { background: #7c6eeb; }
  #applyBtn:active { background: #5a4bd1; }
  .btn-row { display: none; gap: 6px; padding: 8px 12px; border-top: 1px solid #21262d; flex-shrink: 0; }
  .btn-row.open { display: flex; }
  .radius-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .radius-toggle {
    width: 20px; height: 20px; background: none; border: 1px solid #30363d;
    border-radius: 4px; cursor: pointer; color: #8b949e; font-size: 11px;
    display: flex; align-items: center; justify-content: center; padding: 0;
    flex-shrink: 0; transition: all 0.15s;
  }
  .radius-toggle:hover { color: #c9d1d9; border-color: #484f58; }
  .radius-toggle.active { color: #a29bfe; border-color: #6C5CE7; }
  .radius-corners { display: none; gap: 4px; padding: 4px 0 0; }
  .radius-corners.open { display: grid; grid-template-columns: 1fr 1fr; }
  .corner-row {
    display: flex; align-items: center; gap: 4px; font-size: 10px;
  }
  .corner-icon {
    width: 14px; height: 14px; border: 1.5px solid #484f58;
    flex-shrink: 0;
  }
  .corner-icon.tl { border-radius: 4px 0 0 0; border-right: none; border-bottom: none; }
  .corner-icon.tr { border-radius: 0 4px 0 0; border-left: none; border-bottom: none; }
  .corner-icon.bl { border-radius: 0 0 0 4px; border-right: none; border-top: none; }
  .corner-icon.br { border-radius: 0 0 4px 0; border-left: none; border-top: none; }
  .corner-num {
    width: 36px; background: #161b22; color: #c9d1d9;
    border: 1px solid #30363d; border-radius: 4px;
    padding: 2px 3px; font-size: 10px; text-align: center; outline: none;
    font-family: 'SF Mono', Consolas, monospace;
  }
  .corner-num:focus { border-color: #6C5CE7; }
  .align-btn-group {
    display: flex; background: #161b22; border: 1px solid #30363d;
    border-radius: 6px; padding: 2px; gap: 1px;
  }
  .align-btn {
    width: 26px; height: 22px; background: none; border: none;
    border-radius: 4px; cursor: pointer; color: #8b949e;
    display: flex; align-items: center; justify-content: center;
    padding: 0; flex-shrink: 0; transition: color 0.12s, background 0.12s;
  }
  .align-btn:hover { color: #c9d1d9; background: #21262d; }
  .align-btn.active { color: #a29bfe; background: #2d2654; }
  .pad-icon { width: 14px; height: 14px; color: #484f58; flex-shrink: 0; display: block; }
  .stroke-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 2px;
  }
  .stroke-header .prop-section-title { margin-bottom: 0; }
  .sec-add-btn {
    width: 18px; height: 18px; background: none; border: 1px solid #30363d;
    border-radius: 4px; color: #8b949e; font-size: 14px; line-height: 1;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.15s;
  }
  .sec-add-btn:hover { color: #c9d1d9; border-color: #484f58; }
  .sec-remove-btn {
    width: 18px; height: 18px; background: none; border: 1px solid #30363d;
    border-radius: 4px; color: #8b949e; font-size: 14px; line-height: 1;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.15s; margin-left: auto;
  }
  .sec-remove-btn:hover { color: #f85149; border-color: #f85149; }
  #strokeControls { display: none; }
  #strokeControls.open { display: block; }
  #hideToggle.hidden-active { color: #f85149; opacity: 0.7; }
</style>
</head>
<body>

<div class="viewport-area" id="viewportArea">
  <div class="frame-wrapper" id="frameWrapper">
    <iframe id="previewFrame" src="/__proxy/"></iframe>
  </div>
</div>

<div id="dragOverlay"></div>

<!-- Floating control panel (OUTSIDE iframe) -->
<div id="uiPanel">
  <div id="uiToggle"><span style="font-size:14px">🔍</span> Inspect <div class="toggle-switch" id="toggleSwitch"></div></div>
  <div id="uiDimRow" style="display:none">
    <select id="presetSel">
      <option value="0x0">Responsive</option>
      <option value="320x568">iPhone SE 320×568</option>
      <option value="375x667">iPhone 8 375×667</option>
      <option value="375x812">iPhone X 375×812</option>
      <option value="390x844">iPhone 12 390×844</option>
      <option value="393x852">iPhone 14 393×852</option>
      <option value="430x932">iPhone 14 PM 430×932</option>
      <option value="360x640">Android 360×640</option>
      <option value="412x915">Pixel 7 412×915</option>
      <option value="768x1024">iPad Mini 768×1024</option>
      <option value="820x1180">iPad Air 820×1180</option>
      <option value="1024x1366">iPad Pro 1024×1366</option>
      <option value="1280x800">Laptop 1280×800</option>
      <option value="1440x900">Desktop 1440×900</option>
      <option value="1920x1080">Full HD 1920×1080</option>
    </select>
    <input type="number" id="wInput" min="200" max="3840" />
    <span class="x-label">×</span>
    <input type="number" id="hInput" min="200" max="3840" />
    <button class="swap-btn" id="swapBtn" title="Swap width / height">⇄</button>
  </div>
  <div id="uiStatus">✓ <span class="el-tag" id="elTag"></span></div>
  <div id="propsPanel">
    <div class="prop-section" id="secPosition">
      <div class="prop-section-title">Position</div>
      <div id="layoutFlexControls" style="display:none">
        <div id="flexOnlyControls">
        <div class="prop-row">
          <span class="prop-label">Align</span>
          <div style="display:flex;gap:3px;align-items:center;">
            <div class="align-btn-group" id="justifyBtns">
              <button class="align-btn" data-axis="h" data-val="flex-start" title="Align left"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="1.5" height="12" rx="0.5"/><rect x="4" y="3" width="4" height="3" rx="0.5" opacity="0.7"/><rect x="4" y="8" width="6" height="3" rx="0.5" opacity="0.7"/></svg></button>
              <button class="align-btn" data-axis="h" data-val="center" title="Align H center"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="6.25" y="1" width="1.5" height="12" rx="0.5"/><rect x="2" y="3" width="10" height="3" rx="0.5" opacity="0.7"/><rect x="3.5" y="8" width="7" height="3" rx="0.5" opacity="0.7"/></svg></button>
              <button class="align-btn" data-axis="h" data-val="flex-end" title="Align right"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="11.5" y="1" width="1.5" height="12" rx="0.5"/><rect x="4" y="3" width="7" height="3" rx="0.5" opacity="0.7"/><rect x="6" y="8" width="5" height="3" rx="0.5" opacity="0.7"/></svg></button>
            </div>
            <div style="width:1px;height:16px;background:#30363d;flex-shrink:0"></div>
            <div class="align-btn-group" id="alignBtns">
              <button class="align-btn" data-axis="v" data-val="flex-start" title="Align top"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="12" height="1.5" rx="0.5"/><rect x="3" y="4" width="3" height="6" rx="0.5" opacity="0.7"/><rect x="8" y="4" width="3" height="4" rx="0.5" opacity="0.7"/></svg></button>
              <button class="align-btn" data-axis="v" data-val="center" title="Align V center"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="6.25" width="12" height="1.5" rx="0.5"/><rect x="3" y="2" width="3" height="10" rx="0.5" opacity="0.7"/><rect x="8" y="3.5" width="3" height="7" rx="0.5" opacity="0.7"/></svg></button>
              <button class="align-btn" data-axis="v" data-val="flex-end" title="Align bottom"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="11.5" width="12" height="1.5" rx="0.5"/><rect x="3" y="4" width="3" height="7" rx="0.5" opacity="0.7"/><rect x="8" y="6" width="3" height="5" rx="0.5" opacity="0.7"/></svg></button>
            </div>
          </div>
        </div>
        </div>
      </div>
      <div class="prop-row">
        <span class="prop-label">X</span>
        <input type="number" class="prop-num" id="translateX" placeholder="0">
        <span class="unit-label">px</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Y</span>
        <input type="number" class="prop-num" id="translateY" placeholder="0">
        <span class="unit-label">px</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Sticky</span>
        <div class="toggle-switch" id="stickyToggle"></div>
      </div>
    </div>
    <div class="prop-section" id="secLayout">
      <div class="prop-section-title">Layout</div>
        <div class="prop-row">
          <span class="prop-label">Direction</span>
          <div class="align-btn-group" id="directionBtns">
            <button class="align-btn" data-prop="flexDirection" data-val="row" title="Row">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1.5" y="4.5" width="3" height="5" rx="0.5" opacity="0.9"/><rect x="5.5" y="4.5" width="3" height="5" rx="0.5" opacity="0.6"/><rect x="9.5" y="4.5" width="3" height="5" rx="0.5" opacity="0.35"/></svg>
            </button>
            <button class="align-btn" data-prop="flexDirection" data-val="column" title="Column">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="1.5" width="8" height="3" rx="0.5" opacity="0.9"/><rect x="3" y="5.5" width="8" height="3" rx="0.5" opacity="0.6"/><rect x="3" y="9.5" width="8" height="3" rx="0.5" opacity="0.35"/></svg>
            </button>
            <button class="align-btn" data-prop="display" data-val="grid" title="Grid">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="0.5" opacity="0.9"/><rect x="8" y="1.5" width="4.5" height="4.5" rx="0.5" opacity="0.6"/><rect x="1.5" y="8" width="4.5" height="4.5" rx="0.5" opacity="0.6"/><rect x="8" y="8" width="4.5" height="4.5" rx="0.5" opacity="0.35"/></svg>
            </button>
            <button class="align-btn" data-prop="flexWrap" data-val="wrap" title="Wrap">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="3" width="4" height="3.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.7"/><rect x="6.5" y="3" width="4" height="3.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.7"/><rect x="1.5" y="7.5" width="4" height="3.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/></svg>
            </button>
          </div>
        </div>
        <div class="prop-row">
          <span class="prop-label">W</span>
          <input type="number" class="prop-num" id="elWidth" min="0" max="9999" placeholder="auto">
          <span class="unit-label">px</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">H</span>
          <input type="number" class="prop-num" id="elHeight" min="0" max="9999" placeholder="auto">
          <span class="unit-label">px</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Gap</span>
          <input type="number" class="prop-num" id="gapNum" min="0" max="999">
          <span class="unit-label">px</span>
        </div>
    </div>
    <div class="prop-section" id="secSpacing" style="display:flex;flex-direction:column;gap:8px">
      <div class="stroke-header">
        <div class="prop-section-title" style="margin-bottom:0">Appearance</div>
        <button class="sec-add-btn" id="hideToggle" title="Toggle visibility" style="border:none">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>
        </button>
      </div>
      <div>
        <div class="radius-header">
          <span class="prop-label">Padding</span>
          <input type="text" class="prop-num" id="paddingNum" min="0" max="999">
          <span class="unit-label">px</span>
          <button class="radius-toggle" id="paddingExpandBtn" title="Per-side padding">&#9699;</button>
        </div>
        <div class="radius-corners" id="paddingSides">
          <div class="corner-row"><svg class="pad-icon" viewBox="0 0 14 14" fill="none"><rect x="3" y="5" width="8" height="6" stroke="currentColor" stroke-width="1.2" rx="0.5"/><line x1="3" y1="2.5" x2="11" y2="2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="number" class="prop-num" id="pTop" min="0" max="999" placeholder="T"></div>
          <div class="corner-row"><svg class="pad-icon" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="6" height="8" stroke="currentColor" stroke-width="1.2" rx="0.5"/><line x1="11.5" y1="3" x2="11.5" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="number" class="prop-num" id="pRight" min="0" max="999" placeholder="R"></div>
          <div class="corner-row"><svg class="pad-icon" viewBox="0 0 14 14" fill="none"><rect x="3" y="3" width="8" height="6" stroke="currentColor" stroke-width="1.2" rx="0.5"/><line x1="3" y1="11.5" x2="11" y2="11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="number" class="prop-num" id="pBottom" min="0" max="999" placeholder="B"></div>
          <div class="corner-row"><svg class="pad-icon" viewBox="0 0 14 14" fill="none"><rect x="5" y="3" width="6" height="8" stroke="currentColor" stroke-width="1.2" rx="0.5"/><line x1="2.5" y1="3" x2="2.5" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="number" class="prop-num" id="pLeft" min="0" max="999" placeholder="L"></div>
        </div>
      </div>
      <div>
        <div class="radius-header">
          <span class="prop-label">Radius</span>
          <input type="number" class="prop-num" id="radiusNum" min="0" max="999">
          <span class="unit-label">px</span>
          <button class="radius-toggle" id="radiusExpandBtn" title="Per-corner radius">&#9699;</button>
        </div>
        <div class="radius-corners" id="radiusCorners">
          <div class="corner-row"><div class="corner-icon tl"></div><input type="number" class="corner-num" id="rTL" min="0" max="999" placeholder="TL"></div>
          <div class="corner-row"><div class="corner-icon tr"></div><input type="number" class="corner-num" id="rTR" min="0" max="999" placeholder="TR"></div>
          <div class="corner-row"><div class="corner-icon bl"></div><input type="number" class="corner-num" id="rBL" min="0" max="999" placeholder="BL"></div>
          <div class="corner-row"><div class="corner-icon br"></div><input type="number" class="corner-num" id="rBR" min="0" max="999" placeholder="BR"></div>
        </div>
      </div>
    </div>
    <div class="prop-section" id="secBorder">
      <div class="prop-section-title">Border</div>
    </div>
    <div class="prop-section" id="secType">
      <div class="prop-section-title">Typography</div>
      <div class="prop-row">
        <span class="prop-label">Font</span>
        <span class="prop-value" id="fontFamilyVal" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Size</span>
        <input type="number" class="prop-num" id="fontSizeNum" min="8" max="96">
        <span class="unit-label">px</span>
      </div>
      <div class="prop-row">
        <span class="prop-label">Weight</span>
        <select class="prop-select" id="fontWeightSel">
          <option value="100">Thin</option><option value="200">ExtraLight</option>
          <option value="300">Light</option><option value="400">Regular</option>
          <option value="500">Medium</option><option value="600">SemiBold</option>
          <option value="700">Bold</option><option value="800">ExtraBold</option>
          <option value="900">Black</option>
        </select>
      </div>
    </div>
    <div class="prop-section" id="secFill">
      <div class="prop-section-title">Fill</div>
      <div class="prop-row">
        <span class="prop-label">Color</span>
        <div class="color-swatch" id="bgSwatch" data-picker="bg"><div class="color-swatch-inner" id="bgSwatchInner"></div></div>
        <span class="prop-value" id="bgValue"></span>
      </div>
      <div class="prop-row" id="bgHoverRow" style="display:none">
        <span class="prop-label" style="color:#a78bfa">Hover</span>
        <div class="color-swatch" id="bgHoverSwatch"><div class="color-swatch-inner" id="bgHoverSwatchInner"></div></div>
        <span class="prop-value" id="bgHoverValue" style="color:#a78bfa"></span>
      </div>
    </div>
    <div class="prop-section" id="secTextColor">
      <div class="prop-section-title">Text Color</div>
      <div class="prop-row">
        <span class="prop-label">Color</span>
        <div class="color-swatch" id="textSwatch" data-picker="text"><div class="color-swatch-inner" id="textSwatchInner"></div></div>
        <span class="prop-value" id="textValue"></span>
      </div>
      <div class="prop-row" id="textHoverRow" style="display:none">
        <span class="prop-label" style="color:#a78bfa">Hover</span>
        <div class="color-swatch" id="textHoverSwatch"><div class="color-swatch-inner" id="textHoverSwatchInner"></div></div>
        <span class="prop-value" id="textHoverValue" style="color:#a78bfa"></span>
      </div>
    </div>
    <div class="prop-section" id="secStroke">
      <div class="stroke-header">
        <div class="prop-section-title">Stroke</div>
        <button class="sec-add-btn" id="strokeAddBtn" title="Add stroke">+</button>
      </div>
      <div id="strokeControls">
        <div class="prop-row">
          <span class="prop-label">Color</span>
          <div class="color-swatch" id="strokeSwatch" data-picker="stroke"><div class="color-swatch-inner" id="strokeSwatchInner"></div></div>
          <span class="prop-value" id="strokeValue"></span>
          <button class="sec-remove-btn" id="strokeRemoveBtn" title="Remove stroke">&minus;</button>
        </div>
        <div class="prop-row" id="strokeHoverRow" style="display:none">
          <span class="prop-label" style="color:#a78bfa">Hover</span>
          <div class="color-swatch" id="strokeHoverSwatch"><div class="color-swatch-inner" id="strokeHoverSwatchInner"></div></div>
          <span class="prop-value" id="strokeHoverValue" style="color:#a78bfa"></span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Width</span>
          <input type="number" class="prop-num" id="strokeWidthNum" min="0" max="100">
          <span class="unit-label">px</span>
        </div>
      </div>
    </div>
  </div>
  <div class="btn-row" id="btnRow">
    <button id="applyBtn">Apply Changes</button>
    <button id="resetBtn">Reset</button>
  </div>
</div>

<!-- Color picker popup (shared) -->
<div class="cp-popup" id="cpPopup">
  <div class="cp-grad" id="cpGrad">
    <canvas id="cpCanvas"></canvas>
    <div class="cp-grad-thumb" id="cpThumb"></div>
  </div>
  <div class="cp-slider-row">
    <button class="cp-eyedrop" id="cpEyedrop" title="Eyedropper">&#x1F489;</button>
    <div class="cp-sliders">
      <input type="range" class="cp-hue" id="cpHue" min="0" max="360" value="0">
      <input type="range" class="cp-alpha" id="cpAlpha" min="0" max="100" value="100">
    </div>
  </div>
  <div class="cp-hex-row">
    <span class="cp-hex-label">Hex</span>
    <input type="text" class="cp-hex-input" id="cpHex" maxlength="6" placeholder="000000">
    <input type="number" class="cp-alpha-input" id="cpAlphaNum" min="0" max="100" value="100">
    <span class="cp-percent">%</span>
  </div>
</div>

<script>
(function() {
  const viewportArea = document.getElementById('viewportArea');
  const frameWrapper = document.getElementById('frameWrapper');
  const panel = document.getElementById('uiPanel');
  const toggle = document.getElementById('uiToggle');
  const dimRow = document.getElementById('uiDimRow');
  const presetSel = document.getElementById('presetSel');
  const wInput = document.getElementById('wInput');
  const hInput = document.getElementById('hInput');
  const swapBtn = document.getElementById('swapBtn');
  const iframe = document.getElementById('previewFrame');
  const statusEl = document.getElementById('uiStatus');
  const elTag = document.getElementById('elTag');
  const propsPanel = document.getElementById('propsPanel');
  const bgSwatch = document.getElementById('bgSwatch');
  const bgSwatchInner = document.getElementById('bgSwatchInner');
  const textSwatch = document.getElementById('textSwatch');
  const textSwatchInner = document.getElementById('textSwatchInner');
  const strokeSwatch = document.getElementById('strokeSwatch');
  const strokeSwatchInner = document.getElementById('strokeSwatchInner');
  const bgHoverSwatch = document.getElementById('bgHoverSwatch');
  const bgHoverSwatchInner = document.getElementById('bgHoverSwatchInner');
  const textHoverSwatch = document.getElementById('textHoverSwatch');
  const textHoverSwatchInner = document.getElementById('textHoverSwatchInner');
  const strokeHoverSwatch = document.getElementById('strokeHoverSwatch');
  const strokeHoverSwatchInner = document.getElementById('strokeHoverSwatchInner');
  // Color picker popup
  const cpPopup = document.getElementById('cpPopup');
  const cpCanvas = document.getElementById('cpCanvas');
  const cpThumb = document.getElementById('cpThumb');
  const cpHue = document.getElementById('cpHue');
  const cpAlpha = document.getElementById('cpAlpha');
  const cpHex = document.getElementById('cpHex');
  const cpAlphaNum = document.getElementById('cpAlphaNum');
  // Current picker state
  let cpActiveProp = null;
  let cpActiveSwatchInner = null;
  let cpH = 0, cpS = 1, cpV = 1, cpA = 100;
  const strokeWidthNum = document.getElementById('strokeWidthNum');
  const strokeControls = document.getElementById('strokeControls');
  const strokeAddBtn = document.getElementById('strokeAddBtn');
  const strokeRemoveBtn = document.getElementById('strokeRemoveBtn');
  const fontFamilyVal = document.getElementById('fontFamilyVal');
  const fontSizeNum = document.getElementById('fontSizeNum');
  const fontWeightSel = document.getElementById('fontWeightSel');
  const radiusNum = document.getElementById('radiusNum');
  const radiusExpandBtn = document.getElementById('radiusExpandBtn');
  const radiusCorners = document.getElementById('radiusCorners');
  const rTL = document.getElementById('rTL');
  const rTR = document.getElementById('rTR');
  const rBL = document.getElementById('rBL');
  const rBR = document.getElementById('rBR');
  let perCornerMode = false;
  const paddingNum = document.getElementById('paddingNum');
  const paddingExpandBtn = document.getElementById('paddingExpandBtn');
  const paddingSides = document.getElementById('paddingSides');
  const pTop = document.getElementById('pTop');
  const pRight = document.getElementById('pRight');
  const pBottom = document.getElementById('pBottom');
  const pLeft = document.getElementById('pLeft');
  let perSidePaddingMode = false;
  const stickyToggle = document.getElementById('stickyToggle');
  const translateXNum = document.getElementById('translateX');
  const translateYNum = document.getElementById('translateY');
  const layoutFlexControls = document.getElementById('layoutFlexControls');
  const gapNum = document.getElementById('gapNum');
  const elWidth = document.getElementById('elWidth');
  const elHeight = document.getElementById('elHeight');
  var currentDisplay = 'block';
  const resetBtn = document.getElementById('resetBtn');
  const applyBtn = document.getElementById('applyBtn');

  let inspectEnabled = false;
  var dirtyProps = new Set();

  // --- Color utilities ---
  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#000000';
    var m = rgb.match(/(\\d+)/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + [m[0],m[1],m[2]].map(function(x) { return parseInt(x).toString(16).padStart(2,'0'); }).join('');
  }
  function hexToRgb(hex) {
    hex = hex.replace(/^#/,'');
    if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
    if (hex.length !== 6) return {r:0,g:0,b:0};
    return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
  }
  function rgbToHsv(r,g,b) {
    r/=255; g/=255; b/=255;
    var max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, h=0, s=max===0?0:d/max, v=max;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h=((h*60)+360)%360;
    }
    return {h,s,v};
  }
  function hsvToRgb(h,s,v) {
    var c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c, r=0,g=0,b=0;
    if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
    return {r:Math.round((r+m)*255),g:Math.round((g+m)*255),b:Math.round((b+m)*255)};
  }
  function hsvToHex(h,s,v) {
    var rgb=hsvToRgb(h,s,v);
    return '#'+[rgb.r,rgb.g,rgb.b].map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  function hexToHsv(hex) {
    var rgb=hexToRgb(hex); return rgbToHsv(rgb.r,rgb.g,rgb.b);
  }
  function hexAlphaToRgba(hex, alpha) {
    var rgb=hexToRgb(hex);
    return 'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+(alpha/100)+')';
  }

  // --- Canvas gradient drawing ---
  function drawGradient() {
    var w=cpCanvas.width, h=cpCanvas.height;
    var ctx=cpCanvas.getContext('2d');
    // Base hue
    var hueRgb=hsvToRgb(cpH,1,1);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgb('+hueRgb.r+','+hueRgb.g+','+hueRgb.b+')';
    ctx.fillRect(0,0,w,h);
    // White left gradient
    var wg=ctx.createLinearGradient(0,0,w,0);
    wg.addColorStop(0,'rgba(255,255,255,1)');
    wg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=wg; ctx.fillRect(0,0,w,h);
    // Black bottom gradient
    var bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'rgba(0,0,0,0)');
    bg.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
    updateThumb();
  }
  function updateThumb() {
    var w=cpCanvas.width, h=cpCanvas.height;
    var x=cpS*w, y=(1-cpV)*h;
    cpThumb.style.left=(x-6)+'px';
    cpThumb.style.top=(y-6)+'px';
  }
  function cpCurrentHex() { return hsvToHex(cpH,cpS,cpV); }
  function cpCurrentRgba() { return hexAlphaToRgba(cpCurrentHex(), cpA); }
  function updateSwatchAndSend() {
    var hex=cpCurrentHex();
    var rgba=cpCurrentRgba();
    if (cpActiveSwatchInner) cpActiveSwatchInner.style.background=rgba;
    // Update hex and alpha inputs
    cpHex.value=hex.replace('#','');
    cpAlpha.value=cpA;
    cpAlphaNum.value=cpA;
    // Hue slider thumb tint
    var hueColor=hsvToHex(cpH,1,1);
    cpAlpha.style.background='linear-gradient(to right, transparent, '+hueColor+')';
    if (cpActiveProp) { dirtyProps.add(cpActiveProp); sendOverride(cpActiveProp, rgba); }
  }

  // --- Canvas mouse interaction ---
  var cpDragging=false;
  function cpCanvasSetFromEvent(e) {
    var rect=cpCanvas.getBoundingClientRect();
    cpS=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    cpV=1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    drawGradient(); updateSwatchAndSend();
  }
  cpCanvas.addEventListener('mousedown',function(e){ cpDragging=true; cpCanvasSetFromEvent(e); e.preventDefault(); });
  document.addEventListener('mousemove',function(e){ if(cpDragging){ cpCanvasSetFromEvent(e); e.preventDefault(); }});
  document.addEventListener('mouseup',function(){ cpDragging=false; });

  // --- Slider & hex input handlers ---
  cpHue.addEventListener('input',function(){
    cpH=parseFloat(this.value); drawGradient(); updateSwatchAndSend();
  });
  cpAlpha.addEventListener('input',function(){
    cpA=parseFloat(this.value); cpAlphaNum.value=cpA; updateSwatchAndSend();
  });
  cpAlphaNum.addEventListener('input',function(){
    cpA=Math.min(100,Math.max(0,parseInt(this.value)||0)); cpAlpha.value=cpA; updateSwatchAndSend();
  });
  cpHex.addEventListener('input',function(){
    var hex=this.value.replace(/[^0-9a-fA-F]/g,'');
    if(hex.length===6||hex.length===3){
      var hsv=hexToHsv(hex);
      cpH=hsv.h; cpS=hsv.s; cpV=hsv.v;
      cpHue.value=cpH; drawGradient(); updateSwatchAndSend();
    }
  });
  cpHex.addEventListener('keydown',function(e){ e.stopPropagation(); });

  // --- Open / close picker ---
  function openPicker(prop, swatchEl, swatchInnerEl, cssValue) {
    cpActiveProp=prop;
    cpActiveSwatchInner=swatchInnerEl;
    // Parse current color
    var hex=rgbToHex(cssValue);
    var alpha=100;
    if(cssValue && cssValue.startsWith('rgba')){
      var am=cssValue.match(/rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*([\\d.]+)/);
      if(am) alpha=Math.round(parseFloat(am[1])*100);
    }
    var hsv=hexToHsv(hex);
    cpH=hsv.h; cpS=hsv.s; cpV=hsv.v; cpA=alpha;
    cpHue.value=cpH; cpAlpha.value=cpA; cpAlphaNum.value=cpA;
    cpHex.value=hex.replace('#','');
    // Position popup near swatch
    var rect=swatchEl.getBoundingClientRect();
    cpPopup.style.display='block';
    var popW=220, popH=230;
    var left=rect.left, top=rect.bottom+4;
    if(left+popW>window.innerWidth-8) left=window.innerWidth-popW-8;
    if(top+popH>window.innerHeight-8) top=rect.top-popH-4;
    cpPopup.style.left=left+'px';
    cpPopup.style.top=top+'px';
    // Set canvas size and draw
    cpCanvas.width=200; cpCanvas.height=160;
    drawGradient();
  }
  function closePicker() {
    cpPopup.style.display='none';
    cpActiveProp=null;
    cpActiveSwatchInner=null;
  }
  // Close when clicking outside
  document.addEventListener('mousedown',function(e){
    if(cpPopup.style.display==='block' && !cpPopup.contains(e.target)){
      var isSwatch = e.target.closest && e.target.closest('.color-swatch');
      if(!isSwatch) closePicker();
    }
  });
  // Swatch click handlers
  bgSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=bgSwatchInner.style.background||'transparent';
    if(cpPopup.style.display==='block'&&cpActiveProp==='backgroundColor'){ closePicker(); return; }
    openPicker('backgroundColor',bgSwatch,bgSwatchInner,cur);
  });
  textSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=textSwatchInner.style.background||'#000000';
    if(cpPopup.style.display==='block'&&cpActiveProp==='color'){ closePicker(); return; }
    openPicker('color',textSwatch,textSwatchInner,cur);
  });
  strokeSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=strokeSwatchInner.style.background||'#000000';
    if(cpPopup.style.display==='block'&&cpActiveProp==='borderColor'){ closePicker(); return; }
    openPicker('borderColor',strokeSwatch,strokeSwatchInner,cur);
  });
  // Hover swatch click handlers
  bgHoverSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=bgHoverSwatchInner.style.background||'transparent';
    if(cpPopup.style.display==='block'&&cpActiveProp==='hover:backgroundColor'){ closePicker(); return; }
    openPicker('hover:backgroundColor',bgHoverSwatch,bgHoverSwatchInner,cur);
  });
  textHoverSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=textHoverSwatchInner.style.background||'#000000';
    if(cpPopup.style.display==='block'&&cpActiveProp==='hover:color'){ closePicker(); return; }
    openPicker('hover:color',textHoverSwatch,textHoverSwatchInner,cur);
  });
  strokeHoverSwatch.addEventListener('click',function(e){
    e.stopPropagation();
    var cur=strokeHoverSwatchInner.style.background||'#000000';
    if(cpPopup.style.display==='block'&&cpActiveProp==='hover:borderColor'){ closePicker(); return; }
    openPicker('hover:borderColor',strokeHoverSwatch,strokeHoverSwatchInner,cur);
  });
  function parsePx(v) { return parseFloat(v) || 0; }
  function sendOverride(prop, val) {
    if (prop.startsWith('hover:')) {
      var hProp = prop.slice(6);
      try { iframe.contentWindow.postMessage({ type: 'inspect-canvas-hover-override', property: hProp, value: val }, '*'); } catch(e) {}
    } else {
      try { iframe.contentWindow.postMessage({ type: 'inspect-canvas-override', property: prop, value: val }, '*'); } catch(e) {}
    }
  }

  // Collect current dirty overrides from the UI (same logic as Apply button)
  function collectCurrentOverrides() {
    var o = {};
    if (dirtyProps.has('backgroundColor') && document.getElementById('secFill').style.display !== 'none') {
      o.backgroundColor = bgSwatchInner.style.background || 'transparent';
    }
    if (dirtyProps.has('color') && document.getElementById('secTextColor').style.display !== 'none') {
      o.color = textSwatchInner.style.background || '#000000';
    }
    if ((dirtyProps.has('borderColor') || dirtyProps.has('borderWidth')) && strokeControls.classList.contains('open')) {
      o.borderColor = strokeSwatchInner.style.background || '#000000';
      o.borderWidth = (strokeWidthNum.value || '0') + 'px';
      o.borderStyle = 'solid';
    }
    if (dirtyProps.has('fontSize') && document.getElementById('secType').style.display !== 'none') {
      o.fontSize = (fontSizeNum.value || '') + 'px';
    }
    if (dirtyProps.has('fontWeight') && document.getElementById('secType').style.display !== 'none') {
      o.fontWeight = fontWeightSel.value;
    }
    if (dirtyProps.has('borderRadius') && document.getElementById('secBorder').style.display !== 'none') {
      var tl = rTL.value, tr = rTR.value, bl = rBL.value, br = rBR.value;
      if (tl === tr && tr === bl && bl === br) {
        o.borderRadius = tl + 'px';
      } else {
        o.borderRadius = tl + 'px ' + tr + 'px ' + br + 'px ' + bl + 'px';
      }
    }
    if (dirtyProps.has('position')) o.position = stickyToggle.classList.contains('on') ? 'sticky' : 'static';
    if (dirtyProps.has('top')) o.top = stickyToggle.classList.contains('on') ? '0px' : 'auto';
    if (dirtyProps.has('transform')) o.transform = 'translate(' + (translateXNum.value || '0') + 'px, ' + (translateYNum.value || '0') + 'px)';
    if (dirtyProps.has('display')) o.display = currentDisplay;
    if (dirtyProps.has('width')) o.width = elWidth.value ? elWidth.value + 'px' : 'auto';
    if (dirtyProps.has('height')) o.height = elHeight.value ? elHeight.value + 'px' : 'auto';
    if (dirtyProps.has('flexDirection')) { var fdb = document.querySelector('#directionBtns .align-btn[data-prop="flexDirection"].active'); if (fdb) o.flexDirection = fdb.dataset.val; }
    if (dirtyProps.has('flexWrap')) o.flexWrap = document.querySelector('#directionBtns .align-btn[data-prop="flexWrap"]')?.classList.contains('active') ? 'wrap' : 'nowrap';
    if (dirtyProps.has('justifyContent')) { var jab = window._lastAlignJustify; if (jab) o.justifyContent = jab; }
    if (dirtyProps.has('alignItems') && window._lastAlignItems) { o.alignItems = window._lastAlignItems; }
    if (dirtyProps.has('gap')) o.gap = (gapNum.value || '0') + 'px';
    if (dirtyProps.has('padding')) {
      var pt = pTop.value, pr = pRight.value, pb = pBottom.value, pl = pLeft.value;
      if (pt === pr && pr === pb && pb === pl) {
        o.padding = (pt || '0') + 'px';
      } else {
        o.padding = (pt||'0')+'px '+(pr||'0')+'px '+(pb||'0')+'px '+(pl||'0')+'px';
      }
    }
    var hoverOverrides = {};
    if (dirtyProps.has('hover:backgroundColor')) hoverOverrides.backgroundColor = bgHoverSwatchInner.style.background || 'transparent';
    if (dirtyProps.has('hover:color')) hoverOverrides.color = textHoverSwatchInner.style.background || '#000000';
    if (dirtyProps.has('hover:borderColor')) hoverOverrides.borderColor = strokeHoverSwatchInner.style.background || '#000000';
    if (Object.keys(hoverOverrides).length > 0) o._hoverStyles = hoverOverrides;
    return o;
  }

  // Listen for element selection from iframe
  var lastSelectedSelector = null;
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'inspect-canvas-selected') {
      // Auto-persist dirty changes for the PREVIOUS element before switching
      if (dirtyProps.size > 0 && lastSelectedSelector) {
        var pending = collectCurrentOverrides();
        if (Object.keys(pending).length > 0) {
          fetch('/__inspect/persist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selector: lastSelectedSelector, overrides: pending })
          }).catch(function(err) { console.warn('[inspect-canvas] auto-persist failed:', err); });
        }
      }
      lastSelectedSelector = e.data.selector || null;
      dirtyProps.clear();
      var d = e.data, s = d.styles || {};
      elTag.textContent = '\u003C' + d.tag + '\u003E' + (d.text ? ' ' + d.text.slice(0, 30) : '');
      statusEl.style.display = 'block';
      propsPanel.classList.add('open');
      document.getElementById('btnRow').classList.add('open');

      // Progressive disclosure: decide which sections to show
      var tag = d.tag.toLowerCase();
      var TEXT_TAGS = ['h1','h2','h3','h4','h5','h6','p','span','a','button','label','li','td','th','dt','dd','figcaption','blockquote','cite','em','strong','b','i','u','small','sub','sup','code','pre','abbr','time','mark','del','ins','legend','caption','summary','option','textarea','input','select'];
      var INTERACTIVE_TAGS = ['button','a','input','select','textarea','label'];
      var CONTAINER_TAGS = ['div','section','article','main','nav','aside','header','footer','ul','ol','dl','table','thead','tbody','tfoot','tr','form','fieldset','details','figure','dialog','menu'];
      var hasText = !!(d.text && d.text.trim());
      var isTextEl = TEXT_TAGS.indexOf(tag) >= 0 || (hasText && CONTAINER_TAGS.indexOf(tag) < 0);
      var isInteractive = INTERACTIVE_TAGS.indexOf(tag) >= 0;
      var hasStroke = parsePx(s.borderWidth) > 0;
      var hasRadius = parsePx(s.borderRadius) > 0 || parsePx(s.borderTopLeftRadius) > 0;
      var hasBg = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      var isImage = (tag === 'img' || tag === 'svg' || tag === 'video' || tag === 'canvas');
      var hasOpacity = parseFloat(s.opacity || '1') < 1;
      var hasPadding = parsePx(s.padding) > 0;

      var PURE_TEXT_TAGS = ['h1','h2','h3','h4','h5','h6','p','span','em','strong','b','i','u','small','sub','sup','code','pre','abbr','time','mark','del','ins','blockquote','cite','figcaption','legend','caption','summary'];
      var isPureText = PURE_TEXT_TAGS.indexOf(tag) >= 0;
      var CONTAINER_TAGS = ['div','section','article','aside','header','footer','main','nav','ul','ol','dl','table','tbody','thead','tfoot','tr','form','fieldset','details','figure','dialog'];
      var isContainer = CONTAINER_TAGS.indexOf(tag) >= 0;

      // Fill: show for containers, interactive, or elements with visible bg
      document.getElementById('secFill').style.display = (isContainer || isInteractive || hasBg || isImage) ? '' : 'none';
      // Text Color: show for text elements, interactive, or anything with text
      document.getElementById('secTextColor').style.display = (isTextEl) ? '' : 'none';
      // Stroke: always show section, toggle controls
      document.getElementById('secStroke').style.display = '';
      if (hasStroke) {
        strokeControls.classList.add('open');
        strokeAddBtn.style.display = 'none';
      } else {
        strokeControls.classList.remove('open');
        strokeAddBtn.style.display = '';
      }
      // Typography: show if text-bearing element
      document.getElementById('secType').style.display = isTextEl ? '' : 'none';
      // Border radius: show if has radius, is interactive, or is image
      document.getElementById('secBorder').style.display = (hasRadius || isInteractive || isImage) ? '' : 'none';
      // Position: always show
      document.getElementById('secPosition').style.display = '';
      // Layout: always show
      document.getElementById('secLayout').style.display = '';
      // Spacing: always show
      document.getElementById('secSpacing').style.display = '';

      // Colors
      var bgCss = s.backgroundColor || 'transparent';
      bgSwatchInner.style.background = bgCss;
      document.getElementById('bgValue').textContent = rgbToHex(bgCss);
      var textCss = s.color || '#000';
      textSwatchInner.style.background = textCss;
      document.getElementById('textValue').textContent = rgbToHex(textCss);
      // Stroke
      var bc = s.borderColor || 'transparent';
      strokeSwatchInner.style.background = bc;
      document.getElementById('strokeValue').textContent = rgbToHex(bc);
      strokeWidthNum.value = Math.round(parsePx(s.borderWidth));
      // Hover state display
      var hs = d.hoverStyles || {};
      var bgHoverRow = document.getElementById('bgHoverRow');
      var textHoverRow = document.getElementById('textHoverRow');
      var strokeHoverRow = document.getElementById('strokeHoverRow');
      if (hs.backgroundColor || hs.background) {
        var hBg = hs.backgroundColor || hs.background;
        document.getElementById('bgHoverSwatchInner').style.background = hBg;
        document.getElementById('bgHoverValue').textContent = rgbToHex(hBg);
        bgHoverRow.style.display = '';
      } else { bgHoverRow.style.display = 'none'; }
      if (hs.color) {
        document.getElementById('textHoverSwatchInner').style.background = hs.color;
        document.getElementById('textHoverValue').textContent = rgbToHex(hs.color);
        textHoverRow.style.display = '';
      } else { textHoverRow.style.display = 'none'; }
      if (hs.borderColor) {
        document.getElementById('strokeHoverSwatchInner').style.background = hs.borderColor;
        document.getElementById('strokeHoverValue').textContent = rgbToHex(hs.borderColor);
        strokeHoverRow.style.display = '';
      } else { strokeHoverRow.style.display = 'none'; }
      // Typography
      fontFamilyVal.textContent = (s.fontFamily || '').split(',')[0].replace(/['"|]/g, '') || '';
      fontFamilyVal.title = s.fontFamily || '';
      fontSizeNum.value = Math.round(parsePx(s.fontSize));
      fontWeightSel.value = (parseInt(s.fontWeight) || 400).toString();
      // Border radius — compute uniform or per-corner
      var brTL = parsePx(s.borderTopLeftRadius || s.borderRadius);
      var brTR = parsePx(s.borderTopRightRadius || s.borderRadius);
      var brBL = parsePx(s.borderBottomLeftRadius || s.borderRadius);
      var brBR = parsePx(s.borderBottomRightRadius || s.borderRadius);
      var brAll = (brTL === brTR && brTR === brBL && brBL === brBR) ? brTL : brTL;
      radiusNum.value = Math.round(brAll);
      rTL.value = Math.round(brTL); rTR.value = Math.round(brTR);
      rBL.value = Math.round(brBL); rBR.value = Math.round(brBR);
      // Auto-expand per-corner if corners differ
      var cornersMatch = (brTL === brTR && brTR === brBL && brBL === brBR);
      if (!cornersMatch) {
        perCornerMode = true;
        radiusCorners.classList.add('open'); radiusExpandBtn.classList.add('active');
      } else if (perCornerMode) {
        // keep user preference
      } else {
        radiusCorners.classList.remove('open'); radiusExpandBtn.classList.remove('active');
      }
      // Sticky toggle
      var posType = s.position || 'static';
      if (posType === 'sticky') { stickyToggle.classList.add('on'); } else { stickyToggle.classList.remove('on'); }
      // Translate X/Y
      var tf = s.transform || 'none';
      var txMatch = tf.match(/translate(?:X|3d)?\\(([^,)]+)/); 
      var tyMatch = tf.match(/translateY\\(([^)]+)/) || tf.match(/translate(?:3d)?\\([^,]+,\\s*([^,)]+)/);
      translateXNum.value = txMatch ? Math.round(parseFloat(txMatch[1])) || '' : '';
      translateYNum.value = tyMatch ? Math.round(parseFloat(tyMatch[1])) || '' : '';
      // Layout
      currentDisplay = s.display || 'block';
      var isHidden = currentDisplay === 'none';
      var isFlexGrid = currentDisplay === 'flex' || currentDisplay === 'inline-flex' || currentDisplay === 'grid' || currentDisplay === 'inline-grid';
      var isFlexOnly = currentDisplay === 'flex' || currentDisplay === 'inline-flex';
      var isGrid = currentDisplay === 'grid' || currentDisplay === 'inline-grid';
      // Hide toggle state
      var ht = document.getElementById('hideToggle');
      if (isHidden) {
        ht.classList.add('hidden-active');
        ht.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="14" x2="14" y2="2"/></svg>';
      } else {
        ht.classList.remove('hidden-active');
        ht.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>';
      }
      // Direction buttons: highlight active state
      document.querySelectorAll('#directionBtns .align-btn').forEach(function(b) {
        if (b.dataset.prop === 'flexWrap') {
          b.classList.toggle('active', isFlexOnly && (s.flexWrap === 'wrap' || s.flexWrap === 'wrap-reverse'));
        } else if (b.dataset.prop === 'display' && b.dataset.val === 'grid') {
          b.classList.toggle('active', isGrid);
        } else if (b.dataset.prop === 'flexDirection') {
          b.classList.toggle('active', isFlexOnly && b.dataset.val === (s.flexDirection || 'row'));
        }
      });
      // Show/hide align controls based on flex/grid
      layoutFlexControls.style.display = isFlexGrid ? '' : 'none';
      document.getElementById('flexOnlyControls').style.display = isFlexOnly ? '' : 'none';
      if (isFlexGrid) {
        var jv = s.justifyContent || 'normal';
        document.querySelectorAll('#justifyBtns .align-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        var av = s.alignItems || 'normal';
        document.querySelectorAll('#alignBtns .align-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        gapNum.value = Math.round(parsePx(s.gap)) || '';
      } else {
        gapNum.value = '';
      }
      // Spacing — individual padding sides
      var pdT = parsePx(s.paddingTop || s.padding);
      var pdR = parsePx(s.paddingRight || s.padding);
      var pdB = parsePx(s.paddingBottom || s.padding);
      var pdL = parsePx(s.paddingLeft || s.padding);
      pTop.value = Math.round(pdT); pRight.value = Math.round(pdR);
      pBottom.value = Math.round(pdB); pLeft.value = Math.round(pdL);
      var allSame = pdT === pdR && pdR === pdB && pdB === pdL;
      if (allSame) {
        paddingNum.value = Math.round(pdT);
        paddingNum.placeholder = '';
        paddingNum.style.color = '';
      } else {
        paddingNum.value = '';
        paddingNum.placeholder = 'Mixed';
        paddingNum.style.color = 'transparent';
      }
      if (!perSidePaddingMode) {
        paddingSides.classList.remove('open'); paddingExpandBtn.classList.remove('active');
      }
      // Dimensions — populate W/H inputs
      elWidth.value = d.size ? Math.round(d.size.width) : '';
      elHeight.value = d.size ? Math.round(d.size.height) : '';
    }
  });

  // --- Property control handlers ---
  // Color pickers are handled by the swatch click handlers above
  elWidth.addEventListener('change', function() {
    dirtyProps.add('width');
    sendOverride('width', this.value ? this.value + 'px' : 'auto');
  });
  elHeight.addEventListener('change', function() {
    dirtyProps.add('height');
    sendOverride('height', this.value ? this.value + 'px' : 'auto');
  });
  strokeWidthNum.addEventListener('change', function() { dirtyProps.add('borderWidth'); sendOverride('borderWidth', this.value + 'px'); sendOverride('borderStyle', 'solid'); });
  strokeAddBtn.addEventListener('click', function() {
    dirtyProps.add('borderColor'); dirtyProps.add('borderWidth');
    strokeControls.classList.add('open');
    strokeAddBtn.style.display = 'none';
    strokeSwatchInner.style.background = '#000000';
    strokeWidthNum.value = 1;
    sendOverride('borderColor', '#000000');
    sendOverride('borderWidth', '1px');
    sendOverride('borderStyle', 'solid');
  });
  strokeRemoveBtn.addEventListener('click', function() {
    dirtyProps.add('borderColor'); dirtyProps.add('borderWidth');
    strokeControls.classList.remove('open');
    strokeAddBtn.style.display = '';
    sendOverride('border', 'none');
  });
  fontSizeNum.addEventListener('change', function() { dirtyProps.add('fontSize'); sendOverride('fontSize', this.value + 'px'); });
  fontWeightSel.addEventListener('change', function() { dirtyProps.add('fontWeight'); sendOverride('fontWeight', this.value); });
  radiusNum.addEventListener('change', function() {
    dirtyProps.add('borderRadius');
    rTL.value = rTR.value = rBL.value = rBR.value = this.value;
    sendOverride('borderRadius', this.value + 'px');
  });
  radiusExpandBtn.addEventListener('click', function() {
    perCornerMode = !perCornerMode;
    radiusCorners.classList.toggle('open');
    this.classList.toggle('active');
  });
  function sendCornerRadii() {
    dirtyProps.add('borderRadius');
    var v = rTL.value + 'px ' + rTR.value + 'px ' + rBR.value + 'px ' + rBL.value + 'px';
    sendOverride('borderRadius', v);
    // Update uniform slider to average
    var avg = Math.round(([rTL,rTR,rBL,rBR].reduce(function(s,el){return s + (parseInt(el.value)||0);}, 0)) / 4);
    radiusNum.value = avg;
  }
  rTL.addEventListener('change', sendCornerRadii);
  rTR.addEventListener('change', sendCornerRadii);
  rBL.addEventListener('change', sendCornerRadii);
  rBR.addEventListener('change', sendCornerRadii);
  paddingNum.addEventListener('change', function() {
    var v = parseInt(this.value) || 0;
    dirtyProps.add('padding');
    pTop.value = pRight.value = pBottom.value = pLeft.value = v;
    paddingNum.value = v;
    paddingNum.placeholder = '';
    paddingNum.style.color = '';
    sendOverride('padding', v + 'px');
  });
  paddingExpandBtn.addEventListener('click', function() {
    perSidePaddingMode = !perSidePaddingMode;
    paddingSides.classList.toggle('open');
    this.classList.toggle('active');
  });
  function sendSidePaddings() {
    dirtyProps.add('padding');
    var v = pTop.value+'px '+pRight.value+'px '+pBottom.value+'px '+pLeft.value+'px';
    sendOverride('padding', v);
    var vals = [pTop,pRight,pBottom,pLeft].map(function(el){return parseInt(el.value)||0;});
    var allSame = vals.every(function(n){return n===vals[0];});
    if (allSame) {
      paddingNum.value = vals[0];
      paddingNum.placeholder = '';
      paddingNum.style.color = '';
    } else {
      paddingNum.value = '';
      paddingNum.placeholder = 'Mixed';
      paddingNum.style.color = 'transparent';
    }
  }
  pTop.addEventListener('change', sendSidePaddings);
  pRight.addEventListener('change', sendSidePaddings);
  pBottom.addEventListener('change', sendSidePaddings);
  pLeft.addEventListener('change', sendSidePaddings);
  stickyToggle.addEventListener('click', function() {
    var isOn = this.classList.toggle('on');
    dirtyProps.add('position');
    sendOverride('position', isOn ? 'sticky' : 'static');
    if (isOn) { sendOverride('top', '0px'); dirtyProps.add('top'); }
  });
  function sendTranslate() {
    dirtyProps.add('transform');
    var x = translateXNum.value || '0';
    var y = translateYNum.value || '0';
    sendOverride('transform', 'translate(' + x + 'px, ' + y + 'px)');
  }
  translateXNum.addEventListener('change', sendTranslate);
  translateYNum.addEventListener('change', sendTranslate);
  gapNum.addEventListener('change', function() { dirtyProps.add('gap'); sendOverride('gap', this.value + 'px'); });
  // Hide toggle (eye icon)
  var hideToggle = document.getElementById('hideToggle');
  hideToggle.addEventListener('click', function() {
    var isHidden = this.classList.toggle('hidden-active');
    if (isHidden) {
      currentDisplay = 'none';
      this.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="14" x2="14" y2="2"/></svg>';
    } else {
      currentDisplay = 'block';
      this.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>';
    }
    dirtyProps.add('display');
    sendOverride('display', currentDisplay);
  });
  // Helper: update visibility of align/flex controls based on current display mode
  function updateLayoutVisibility() {
    var isFG = currentDisplay === 'flex' || currentDisplay === 'inline-flex' || currentDisplay === 'grid' || currentDisplay === 'inline-grid';
    var isFO = currentDisplay === 'flex' || currentDisplay === 'inline-flex';
    layoutFlexControls.style.display = isFG ? '' : 'none';
    document.getElementById('flexOnlyControls').style.display = isFO ? '' : 'none';
  }
  document.querySelectorAll('.align-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var axis = this.dataset.axis;
      var prop = this.dataset.prop;
      var val = this.dataset.val;
      // flexWrap toggle — handle first to avoid wrong sendOverride
      if (prop === 'flexWrap') {
        var isActive = this.classList.contains('active');
        this.classList.toggle('active', !isActive);
        dirtyProps.add(prop);
        sendOverride(prop, isActive ? 'nowrap' : 'wrap');
        return;
      }
      // Grid button — toggle grid display mode
      if (prop === 'display' && val === 'grid') {
        var wasGrid = this.classList.contains('active');
        // Deactivate all direction buttons (row/column/grid) but leave wrap
        document.querySelectorAll('#directionBtns .align-btn[data-prop="flexDirection"], #directionBtns .align-btn[data-prop="display"]').forEach(function(b) {
          b.classList.remove('active');
        });
        if (!wasGrid) {
          this.classList.add('active');
          currentDisplay = 'grid';
        } else {
          currentDisplay = 'block';
        }
        dirtyProps.add('display');
        sendOverride('display', currentDisplay);
        updateLayoutVisibility();
        return;
      }
      // flexDirection — toggle among row/column, also sets display:flex implicitly
      if (prop === 'flexDirection') {
        var wasActive = this.classList.contains('active');
        // Deactivate all direction buttons (row/column/grid) but leave wrap
        document.querySelectorAll('#directionBtns .align-btn[data-prop="flexDirection"], #directionBtns .align-btn[data-prop="display"]').forEach(function(b) {
          b.classList.remove('active');
        });
        if (!wasActive) {
          this.classList.add('active');
          currentDisplay = 'flex';
          dirtyProps.add('display');
          dirtyProps.add('flexDirection');
          sendOverride('display', 'flex');
          sendOverride('flexDirection', val);
        } else {
          // Deselect → back to block
          currentDisplay = 'block';
          dirtyProps.add('display');
          sendOverride('display', 'block');
        }
        updateLayoutVisibility();
        return;
      }
      // For H/V align buttons, resolve correct CSS property based on flex-direction
      if (axis) {
        var dir = 'row';
        document.querySelectorAll('#directionBtns .align-btn[data-prop="flexDirection"].active').forEach(function(b) {
          dir = b.dataset.val;
        });
        var isCol = dir === 'column' || dir === 'column-reverse';
        prop = (axis === 'h') ? (isCol ? 'alignItems' : 'justifyContent') : (isCol ? 'justifyContent' : 'alignItems');
      }
      dirtyProps.add(prop);
      sendOverride(prop, val);
      // Align buttons: one-shot flash, mutually exclusive across both groups
      if (this.closest('#justifyBtns') || this.closest('#alignBtns')) {
        document.querySelectorAll('#justifyBtns .align-btn, #alignBtns .align-btn').forEach(function(b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
        setTimeout(function() { btn.classList.remove('active'); }, 300);
        if (prop === 'justifyContent') window._lastAlignJustify = val;
        if (prop === 'alignItems') window._lastAlignItems = val;
        return;
      }
      // Fallback: generic button group toggle
      this.closest('.align-btn-group').querySelectorAll('.align-btn').forEach(function(b) {
        b.classList.toggle('active', b === btn);
      });
    });
  });
  statusEl.addEventListener('click', function() { propsPanel.classList.toggle('open'); document.getElementById('btnRow').classList.toggle('open'); });
  resetBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    try { iframe.contentWindow.postMessage({ type: 'inspect-canvas-reset' }, '*'); } catch(e) {}
    propsPanel.classList.remove('open');
    document.getElementById('btnRow').classList.remove('open');
  });
  applyBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var overrides = collectCurrentOverrides();
    if (Object.keys(overrides).length === 0) {
      applyBtn.textContent = 'Nothing changed';
      setTimeout(function() { applyBtn.textContent = 'Apply Changes'; }, 1200);
      return;
    }

    fetch('/__inspect/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: overrides })
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.ok) {
        applyBtn.textContent = '\u2713 Applied';
        applyBtn.style.background = '#5a4bd1';
        // Reload iframe to reflect source changes, then re-select the same element
        var selectorToRestore = lastSelectedSelector;
        iframe.addEventListener('load', function onReload() {
          iframe.removeEventListener('load', onReload);
          setTimeout(function() {
            // Re-enable inspect mode in the iframe
            iframe.contentWindow.postMessage({ type: 'inspect-canvas-toggle', enabled: true }, '*');
            // Re-select the same element
            if (selectorToRestore) {
              iframe.contentWindow.postMessage({ type: 'inspect-canvas-reselect', selector: selectorToRestore }, '*');
            }
            applyBtn.textContent = 'Apply Changes';
            applyBtn.style.background = '';
          }, 600);
        });
        iframe.contentWindow.location.reload();
      }
    }).catch(function(err) { console.error('[inspect-canvas] apply failed:', err); });
  });

  function applyViewport(w, h) {
    if (w === 0 && h === 0) {
      viewportArea.classList.remove('responsive-mode');
      frameWrapper.style.width = '100%';
      frameWrapper.style.height = '100%';
      frameWrapper.style.transform = '';
    } else {
      viewportArea.classList.add('responsive-mode');
      const areaW = viewportArea.clientWidth - 32;
      const areaH = viewportArea.clientHeight - 32;
      const scale = Math.min(1, areaW / w, areaH / h);
      frameWrapper.style.width = w + 'px';
      frameWrapper.style.height = h + 'px';
      if (scale < 1) {
        frameWrapper.style.transform = 'scale(' + scale + ')';
        frameWrapper.style.transformOrigin = 'top center';
      } else {
        frameWrapper.style.transform = '';
      }
    }
    wInput.value = w || '';
    hInput.value = h || '';
  }

  // Toggle inspect
  const dragOverlay = document.getElementById('dragOverlay');
  let dragState = null;
  toggle.addEventListener('mousedown', (e) => {
    dragState = { startX: e.clientX, startY: e.clientY, moved: false };
    const rect = panel.getBoundingClientRect();
    dragState.panelX = rect.left;
    dragState.panelY = rect.top;
    panel.classList.add('dragging');
    dragOverlay.style.display = 'block';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
    if (!dragState.moved) return;
    panel.style.left = (dragState.panelX + dx) + 'px';
    panel.style.top = (dragState.panelY + dy) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!dragState) return;
    const wasDrag = dragState.moved;
    panel.classList.remove('dragging');
    dragOverlay.style.display = 'none';
    dragState = null;
    if (wasDrag) return; // don't toggle if it was a drag
    // It was a click — toggle inspect
    inspectEnabled = !inspectEnabled;
    const sw = document.getElementById('toggleSwitch');
    if (inspectEnabled) { sw.classList.add('on'); } else { sw.classList.remove('on'); }
    dimRow.style.display = inspectEnabled ? 'flex' : 'none';
    panel.style.background = inspectEnabled ? '#0D1117' : '#64748b';
    iframe.contentWindow.postMessage({ type: 'inspect-canvas-toggle', enabled: inspectEnabled }, '*');
    if (!inspectEnabled) {
      applyViewport(0, 0);
      presetSel.value = '0x0';
      propsPanel.classList.remove('open');
      document.getElementById('btnRow').classList.remove('open');
      statusEl.style.display = 'none';
    }
  });

  // Preset change
  presetSel.addEventListener('change', () => {
    const [w, h] = presetSel.value.split('x').map(Number);
    applyViewport(w, h);
  });

  // Manual width/height
  wInput.addEventListener('change', () => {
    const w = parseInt(wInput.value) || 0;
    const h = parseInt(hInput.value) || 0;
    if (w > 0 && h > 0) applyViewport(w, h);
  });
  hInput.addEventListener('change', () => {
    const w = parseInt(wInput.value) || 0;
    const h = parseInt(hInput.value) || 0;
    if (w > 0 && h > 0) applyViewport(w, h);
  });

  // Swap
  swapBtn.addEventListener('click', () => {
    const w = parseInt(wInput.value) || 0;
    const h = parseInt(hInput.value) || 0;
    if (w > 0 && h > 0) {
      presetSel.value = '0x0';
      applyViewport(h, w);
    }
  });
})();
</script>
</body>
</html>`;
}

// ─── Inspector script injected into HTML pages ────────────────────────────

function getInspectorScript(serverPort: number): string {
  return `<script>
(function() {
  const STYLE_KEYS = [
    'display', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap',
    'width', 'height', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin',
    'backgroundColor', 'color', 'opacity',
    'border', 'borderRadius', 'borderColor', 'borderWidth', 'borderStyle',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'textAlign', 'textDecoration', 'textTransform',
    'boxShadow', 'backgroundImage', 'overflow', 'position',
    'top', 'right', 'bottom', 'left', 'zIndex',
  ];

  let hoverOverlay = null;
  let selectedOverlay = null;
  let tooltip = null;
  let inspectEnabled = false;
  let selectedEl = null;
  let originalStyles = '';

  function init() {
    hoverOverlay = document.createElement('div');
    hoverOverlay.setAttribute('data-inspect-canvas', '');
    Object.assign(hoverOverlay.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483646',
      border: '2px solid #6C5CE7', borderRadius: '2px',
      backgroundColor: 'rgba(108,92,231,0.08)',
      transition: 'all 0.1s ease', display: 'none',
    });
    document.documentElement.appendChild(hoverOverlay);

    selectedOverlay = document.createElement('div');
    selectedOverlay.setAttribute('data-inspect-canvas', '');
    Object.assign(selectedOverlay.style, {
      position: 'absolute', pointerEvents: 'none', zIndex: '2147483645',
      border: '2px solid #22c55e', borderRadius: '2px',
      backgroundColor: 'rgba(34,197,94,0.08)',
      display: 'none',
    });
    document.documentElement.appendChild(selectedOverlay);

    tooltip = document.createElement('div');
    tooltip.setAttribute('data-inspect-canvas', '');
    Object.assign(tooltip.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
      background: '#1e293b', color: '#f8fafc', fontSize: '11px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '6px 10px', borderRadius: '6px', whiteSpace: 'nowrap',
      display: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      lineHeight: '1.5', maxWidth: '320px',
    });
    document.documentElement.appendChild(tooltip);

    // Listen for messages from parent shell
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'inspect-canvas-toggle') {
        inspectEnabled = e.data.enabled;
        if (!inspectEnabled) {
          hoverOverlay.style.display = 'none';
          selectedOverlay.style.display = 'none';
          tooltip.style.display = 'none';
        }
      }
      if (e.data && e.data.type === 'inspect-canvas-override' && selectedEl) {
        var cssProp = e.data.property.replace(/[A-Z]/g, function(m){return '-'+m.toLowerCase();});
        selectedEl.style.setProperty(cssProp, e.data.value, 'important');
      }
      if (e.data && e.data.type === 'inspect-canvas-hover-override' && selectedEl) {
        if (!window._icHoverOverrides) window._icHoverOverrides = {};
        window._icHoverOverrides[e.data.property] = e.data.value;
        var styleTag = document.getElementById('inspect-canvas-hover-style');
        if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'inspect-canvas-hover-style'; document.head.appendChild(styleTag); }
        var sel = selectedEl.getAttribute('data-ic-sel');
        if (!sel) { sel = 'ic-hover-' + Date.now(); selectedEl.setAttribute('data-ic-sel', sel); }
        var css = '[data-ic-sel="' + sel + '"]:hover {';
        for (var hp in window._icHoverOverrides) { css += hp.replace(/[A-Z]/g, function(m){return '-'+m.toLowerCase();}) + ':' + window._icHoverOverrides[hp] + ' !important;'; }
        css += '}';
        styleTag.textContent = css;
      }
      if (e.data && e.data.type === 'inspect-canvas-reset' && selectedEl) {
        selectedEl.style.cssText = originalStyles || '';
        var hst = document.getElementById('inspect-canvas-hover-style'); if (hst) hst.textContent = '';
        if (selectedEl.getAttribute('data-ic-sel')) selectedEl.removeAttribute('data-ic-sel');
        window._icHoverOverrides = null;
      }
      if (e.data && e.data.type === 'inspect-canvas-reselect' && e.data.selector) {
        var target = document.querySelector(e.data.selector);
        if (target) {
          inspectEnabled = true;
          onClick({ target: target, preventDefault: function(){}, stopPropagation: function(){}, stopImmediatePropagation: function(){} });
        }
      }
    });

    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  function isInspectorEl(el) {
    if (!el) return false;
    return el.hasAttribute?.('data-inspect-canvas') || el.closest?.('[data-inspect-canvas]');
  }

  function findBestTarget(el) {
    const INTERACTIVE = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    let current = el;
    while (current && current !== document.body) {
      if (INTERACTIVE.includes(current.tagName)) return current;
      current = current.parentElement;
    }
    return el;
  }

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    while (el && el !== document.body && el !== document.documentElement) {
      let part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\\s+/).filter(c => c && !c.startsWith('inspect-canvas'));
        if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          part += ':nth-child(' + (Array.from(parent.children).indexOf(el) + 1) + ')';
        }
      }
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function getLabel(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 30);
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (tag === 'img') return 'Image' + (el.alt ? ': ' + el.alt.slice(0, 20) : '');
    if (tag === 'button' || tag === 'a') return (tag === 'button' ? 'Button' : 'Link') + (text ? ': ' + text : '');
    if (tag === 'input') return 'Input (' + (el.type || 'text') + ')';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'Heading: ' + text;
    if (tag === 'p') return 'Text: ' + text;
    if (text && text.length < 30) return tag + ': ' + text;
    return tag;
  }

  // --- Accessibility helpers ---
  function parseRgb(c) {
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return null;
    var m = c.match(/(\\d+(?:\\.\\d+)?)/g);
    if (!m || m.length < 3) return null;
    var a = m.length >= 4 ? parseFloat(m[3]) : 1;
    return { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]), a: a };
  }
  function blendOnBg(fg, bg) {
    if (!fg || fg.a >= 1) return fg;
    var a = fg.a;
    return { r: Math.round(fg.r * a + bg.r * (1 - a)), g: Math.round(fg.g * a + bg.g * (1 - a)), b: Math.round(fg.b * a + bg.b * (1 - a)), a: 1 };
  }
  function relativeLuminance(rgb) {
    var rs = rgb.r / 255, gs = rgb.g / 255, bs = rgb.b / 255;
    var r = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
    var g = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
    var b = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(l1, l2) {
    var lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function getEffectiveBg(el) {
    var layers = [];
    var cur = el;
    while (cur && cur !== document.documentElement) {
      var bg = window.getComputedStyle(cur).backgroundColor;
      var parsed = parseRgb(bg);
      if (parsed && parsed.a > 0) {
        layers.unshift(parsed);
        if (parsed.a >= 1) break; // opaque — no need to go further
      }
      cur = cur.parentElement;
    }
    // Start from white and blend each layer on top
    var result = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = 0; i < layers.length; i++) {
      result = blendOnBg(layers[i], result);
    }
    return result;
  }
  function getAccessibleName(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) {
      var ids = el.getAttribute('aria-labelledby').split(/\\s+/);
      var names = ids.map(function(id) { var e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; }).filter(Boolean);
      if (names.length) return names.join(' ');
    }
    if (el.tagName === 'IMG') return el.alt || '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.labels && el.labels.length) return (el.labels[0].textContent || '').trim();
      if (el.placeholder) return el.placeholder;
      return '';
    }
    var text = (el.textContent || '').trim();
    return text.length > 40 ? text.slice(0, 40) + '…' : text;
  }
  function getRole(el) {
    if (el.getAttribute('role')) return el.getAttribute('role');
    var tag = el.tagName;
    var roleMap = { A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', IMG: 'img', NAV: 'navigation', MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary', SECTION: 'region', ARTICLE: 'article', FORM: 'form', TABLE: 'table', UL: 'list', OL: 'list', LI: 'listitem', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading' };
    if (tag === 'INPUT') {
      var t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'range') return 'slider';
      return 'textbox';
    }
    return roleMap[tag] || 'generic';
  }

  function onHover(e) {
    if (!inspectEnabled) return;
    const raw = e.target;
    if (!raw || raw === document.body || raw === document.documentElement || isInspectorEl(raw)) {
      hoverOverlay.style.display = 'none';
      tooltip.style.display = 'none';
      return;
    }
    const el = findBestTarget(raw);
    const rect = el.getBoundingClientRect();
    Object.assign(hoverOverlay.style, {
      display: 'block',
      top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
    });
    // Build rich tooltip
    const cs = window.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\\s+/).slice(0, 4).join('.') : '';
    const selectorShort = tag + (cls ? '.' + cls : '');
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const bg = cs.backgroundColor || 'transparent';
    const pd = cs.padding || '0px';
    const mg = cs.margin || '0px';
    const dp = cs.display;
    // Color swatch helper
    function swatch(c) {
      if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return '';
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + c + ';border:1px solid rgba(255,255,255,0.2);vertical-align:middle;margin-right:4px"></span>';
    }
    var row = function(label, val) { return '<div style="display:flex;gap:12px;margin-bottom:2px"><span style="color:#8b949e;min-width:52px">' + label + '</span><span style="color:#c9d1d9;font-family:SF Mono,Consolas,monospace;font-size:11px">' + val + '</span></div>'; };
    var lines = [];
    lines.push('<div style="color:#93c5fd;font-size:11px;font-family:SF Mono,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;max-width:290px;margin-bottom:3px">' + selectorShort + '</div>');
    lines.push(row('Size', w + ' × ' + h));
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      lines.push('<div style="display:flex;gap:12px;margin-bottom:2px"><span style="color:#8b949e;min-width:52px">BG</span><span style="color:#c9d1d9">' + swatch(bg) + bg + '</span></div>');
    }
    lines.push(row('Padding', pd));
    if (mg !== '0px') lines.push(row('Margin', mg));
    lines.push(row('Display', dp + (cs.flexDirection && dp.indexOf('flex') >= 0 ? ' / ' + cs.flexDirection : '')));

    // --- Accessibility section ---
    lines.push('<div style="border-top:1px solid #30363d;margin:4px 0 3px;padding-top:4px;color:#6e7681;font-size:9px;text-transform:uppercase;letter-spacing:0.5px">A11Y</div>');

    // Contrast ratio (for elements with visible text)
    var hasText = el.textContent && el.textContent.trim().length > 0;
    // Only compute contrast if the element itself renders text (has direct text or is a leaf-like element)
    var isTextElement = false;
    if (hasText) {
      var childNodes = el.childNodes;
      for (var ci = 0; ci < childNodes.length; ci++) {
        if (childNodes[ci].nodeType === 3 && childNodes[ci].textContent.trim()) { isTextElement = true; break; }
      }
      // Also count elements that only have inline children (spans, strongs, ems, etc.)
      if (!isTextElement) {
        var inlineTags = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'A', 'SMALL', 'SUB', 'SUP', 'MARK', 'CODE', 'BR'];
        var allInline = true;
        for (var ci2 = 0; ci2 < el.children.length; ci2++) {
          if (inlineTags.indexOf(el.children[ci2].tagName) < 0) { allInline = false; break; }
        }
        if (allInline && el.children.length <= 5) isTextElement = true;
      }
      // Headings, paragraphs, labels, buttons, links always count
      var textTags = ['H1','H2','H3','H4','H5','H6','P','LABEL','BUTTON','A','SPAN','LI','TD','TH','FIGCAPTION','BLOCKQUOTE'];
      if (textTags.indexOf(el.tagName) >= 0) isTextElement = true;
    }
    if (isTextElement) {
      var textColor = parseRgb(cs.color);
      var bgColor = getEffectiveBg(el);
      if (textColor && bgColor) {
        var fgBlend = textColor.a < 1 ? blendOnBg(textColor, bgColor) : textColor;
        var ratio = contrastRatio(relativeLuminance(fgBlend), relativeLuminance(bgColor));
        var ratioStr = ratio.toFixed(2) + ':1';
        var fontSize = parseFloat(cs.fontSize);
        var isBold = parseInt(cs.fontWeight) >= 700;
        var isLargeText = fontSize >= 24 || (fontSize >= 18.66 && isBold);
        var aaThreshold = isLargeText ? 3 : 4.5;
        var aaaThreshold = isLargeText ? 4.5 : 7;
        var icon, color;
        if (ratio >= aaaThreshold) { icon = '✅'; color = '#4ade80'; }
        else if (ratio >= aaThreshold) { icon = '✅'; color = '#4ade80'; }
        else { icon = '❌'; color = '#f87171'; }
        var level = ratio >= aaaThreshold ? 'AAA' : (ratio >= aaThreshold ? 'AA' : 'Fail');
        lines.push('<div style="display:flex;gap:12px;margin-bottom:2px;align-items:center"><span style="color:#8b949e;min-width:52px">Contrast</span><span style="font-family:SF Mono,Consolas,monospace;font-size:11px;color:' + color + '">' + ratioStr + ' ' + level + ' ' + icon + '</span></div>');
      }
    }

    // Role
    var role = getRole(el);
    lines.push(row('Role', role));

    // Accessible name (for interactive/semantic elements)
    var interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    if (interactiveTags.indexOf(el.tagName) >= 0 || el.getAttribute('role') || el.getAttribute('tabindex')) {
      var accName = getAccessibleName(el);
      if (accName) {
        lines.push('<div style="display:flex;gap:12px;margin-bottom:2px"><span style="color:#8b949e;min-width:52px">Name</span><span style="color:#c9d1d9;font-size:11px;overflow:hidden;text-overflow:ellipsis;max-width:200px">' + accName + '</span></div>');
      } else if (interactiveTags.indexOf(el.tagName) >= 0) {
        lines.push('<div style="display:flex;gap:12px;margin-bottom:2px"><span style="color:#8b949e;min-width:52px">Name</span><span style="color:#f87171;font-size:11px">⚠ Missing</span></div>');
      }
    }

    // Keyboard focusable
    var focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    var tabIdx = el.getAttribute('tabindex');
    var isFocusable = focusableTags.indexOf(el.tagName) >= 0 || (tabIdx !== null && tabIdx !== '-1');
    var shouldBeFocusable = el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' || el.style.cursor === 'pointer' || cs.cursor === 'pointer';
    if (isFocusable || shouldBeFocusable) {
      var kbIcon = isFocusable ? '<span style="color:#4ade80">✓</span>' : '<span style="color:#f87171">✗</span>';
      lines.push('<div style="display:flex;gap:12px;margin-bottom:2px"><span style="color:#8b949e;min-width:52px">Keyboard</span>' + kbIcon + '</div>');
    }

    tooltip.innerHTML = lines.join('');
    tooltip.style.display = 'block';
    // Position tooltip: prefer below the element, fallback above
    var tooltipTop = rect.bottom + 6;
    if (tooltipTop + 160 > window.innerHeight) tooltipTop = Math.max(0, rect.top - 180);
    tooltip.style.top = tooltipTop + 'px';
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
  }

  function getHoverStyles(el) {
    var hoverProps = {};
    try {
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) {
        var rules;
        try { rules = sheets[i].cssRules || sheets[i].rules; } catch(e) { continue; }
        if (!rules) continue;
        for (var j = 0; j < rules.length; j++) {
          var rule = rules[j];
          if (!rule.selectorText) continue;
          if (rule.selectorText.indexOf(':hover') < 0) continue;
          var selectors = rule.selectorText.split(',');
          for (var k = 0; k < selectors.length; k++) {
            var sel = selectors[k].trim();
            if (sel.indexOf(':hover') < 0) continue;
            var baseSel = sel.replace(/:hover/g, '');
            try { if (!el.matches(baseSel)) continue; } catch(e) { continue; }
            var style = rule.style;
            for (var p = 0; p < style.length; p++) {
              var prop = style[p];
              var camel = prop.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
              hoverProps[camel] = style.getPropertyValue(prop);
            }
          }
        }
      }
    } catch(e) {}
    return hoverProps;
  }

  function onClick(e) {
    const raw = e.target;
    if (isInspectorEl(raw)) return;
    if (!inspectEnabled) return;
    if (!raw) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el = findBestTarget(raw);
    selectedEl = el;
    originalStyles = el.style.cssText || '';
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    const styles = {};
    STYLE_KEYS.forEach(k => {
      const v = computed.getPropertyValue(
        k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
      );
      if (v) styles[k] = v;
    });

    const hoverDeclared = getHoverStyles(el);
    var hoverStyles = Object.keys(hoverDeclared).length > 0 ? hoverDeclared : undefined;

    const data = {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 200) || undefined,
      selector: getSelector(el),
      styles: styles,
      hoverStyles: hoverStyles,
      size: { width: Math.round(rect.width), height: Math.round(rect.height) },
      position: { x: Math.round(rect.left), y: Math.round(rect.top) },
      source: el.getAttribute('data-source') || undefined,
    };

    Object.assign(selectedOverlay.style, {
      display: 'block',
      top: (rect.top + window.scrollY) + 'px', left: (rect.left + window.scrollX) + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
    });

    fetch(window.location.origin + '/__inspect/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(() => {
      try { window.parent.postMessage({ type: 'inspect-canvas-selected', tag: data.tag, text: data.text || '', styles: data.styles, hoverStyles: data.hoverStyles, size: data.size, selector: data.selector }, '*'); } catch(e) {}
    }).catch(err => console.error('[inspect-canvas] save failed:', err));
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      hoverOverlay.style.display = 'none';
      selectedOverlay.style.display = 'none';
      tooltip.style.display = 'none';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
<\/script>`;
}
