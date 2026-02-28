/**
 * figma-html-import — Preview Server
 *
 * Launches a local Express server that:
 *   1. Renders the target URL in an iframe with a floating "Send to Figma" overlay
 *   2. Exposes a POST /api/send endpoint that converts and sends to Figma
 *   3. Exposes a POST /api/extract endpoint for extracting element HTML via Puppeteer
 */

import express from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { htmlToFigma, htmlToCommands } from "./index.js";
import { fetchUrlAsHtml } from "./url-fetcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface PreviewOptions {
  /** URL to preview */
  url: string;
  /** Server port (default: 3100) */
  port?: number;
  /** Figma bridge port (default: 18211) */
  wsPort?: number;
  /** CSS selector to extract (optional) */
  selector?: string;
  /** Open browser automatically (default: true) */
  openBrowser?: boolean;
}

export async function startPreviewServer(options: PreviewOptions): Promise<void> {
  const {
    url,
    port = 3100,
    wsPort = 18211,
    selector,
    openBrowser = true,
  } = options;

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ─── Serve the preview page ──────────────────────────────────────────
  app.get("/", (_req, res) => {
    const html = getPreviewHtml(url, wsPort, selector);
    res.type("html").send(html);
  });

  // ─── API: Send HTML to Figma ─────────────────────────────────────────
  app.post("/api/send", async (req, res) => {
    try {
      const { html, selector: sel } = req.body;

      if (!html || typeof html !== "string") {
        res.status(400).json({ error: "Missing 'html' in request body" });
        return;
      }

      const result = await htmlToFigma(html, {
        wsPort,
        selector: sel,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Extract HTML from URL via Puppeteer ────────────────────────
  app.post("/api/extract", async (req, res) => {
    try {
      const { url: targetUrl, selector: sel } = req.body;
      const extractedHtml = await fetchUrlAsHtml(targetUrl || url, {
        selector: sel || "body",
      });
      res.json({ html: extractedHtml });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── API: Dry-run (preview commands) ─────────────────────────────────
  app.post("/api/preview", async (req, res) => {
    try {
      const { html } = req.body;
      if (!html) {
        res.status(400).json({ error: "Missing 'html'" });
        return;
      }
      const commands = htmlToCommands(html);
      res.json({ commands, count: commands.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Start ───────────────────────────────────────────────────────────
  return new Promise<void>((_resolve) => {
    const server = app.listen(port, async () => {
      console.log(`\n  Preview server running at http://localhost:${port}`);
      console.log(`  Previewing: ${url}`);
      console.log(`  Figma bridge port: ${wsPort}\n`);

      if (openBrowser) {
        try {
          const open = (await import("open")).default;
          await open(`http://localhost:${port}`);
        } catch {
          console.log(`  Open http://localhost:${port} in your browser`);
        }
      }
    });

    // Explicitly keep the event loop alive
    server.ref();
    const keepAlive = setInterval(() => {}, 1 << 30);

    // Resolve on SIGINT/SIGTERM
    const shutdown = () => {
      clearInterval(keepAlive);
      server.close();
      _resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

function getPreviewHtml(targetUrl: string, wsPort: number, selector?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>figma-html-import — Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #fff; height: 100vh; display: flex; flex-direction: column; }

    /* ─── Top Bar ─────────────────────────────── */
    .toolbar {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; background: #2d2d2d;
      border-bottom: 1px solid #404040; flex-shrink: 0;
    }
    .toolbar-logo {
      font-weight: 700; font-size: 14px; color: #a78bfa;
      white-space: nowrap;
    }
    .toolbar input[type="text"] {
      flex: 1; padding: 8px 12px; border-radius: 8px;
      border: 1px solid #555; background: #1e1e1e; color: #fff;
      font-size: 14px; outline: none;
    }
    .toolbar input[type="text"]:focus { border-color: #a78bfa; }
    .toolbar select {
      padding: 8px 12px; border-radius: 8px; border: 1px solid #555;
      background: #1e1e1e; color: #fff; font-size: 13px; cursor: pointer;
    }

    /* ─── Buttons ─────────────────────────────── */
    .btn {
      padding: 8px 20px; border-radius: 8px; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease; white-space: nowrap;
    }
    .btn-primary {
      background: #a78bfa; color: #fff;
    }
    .btn-primary:hover { background: #8b5cf6; }
    .btn-primary:active { transform: scale(0.97); }
    .btn-primary:disabled { background: #555; cursor: not-allowed; }
    .btn-secondary {
      background: #404040; color: #ccc;
    }
    .btn-secondary:hover { background: #505050; }
    .btn-send {
      background: #3B82F6; color: #fff; font-size: 15px; padding: 10px 28px;
    }
    .btn-send:hover { background: #2563eb; }
    .btn-send:disabled { background: #555; cursor: not-allowed; }

    /* ─── Preview Area ────────────────────────── */
    .preview-container { flex: 1; position: relative; overflow: hidden; }
    .preview-container iframe {
      width: 100%; height: 100%; border: none; background: #fff;
    }

    /* ─── Status Bar ──────────────────────────── */
    .status-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: #2d2d2d;
      border-top: 1px solid #404040; font-size: 12px; color: #888;
      flex-shrink: 0;
    }
    .status-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      margin-right: 6px;
    }
    .status-dot.connected { background: #22c55e; }
    .status-dot.disconnected { background: #ef4444; }
    .status-dot.loading { background: #f59e0b; animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: 0.4; } }

    /* ─── Toast ───────────────────────────────── */
    .toast {
      position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
      padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500;
      z-index: 1000; opacity: 0; transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .toast.show { opacity: 1; }
    .toast.success { background: #22c55e; color: #fff; }
    .toast.error { background: #ef4444; color: #fff; }
    .toast.info { background: #3b82f6; color: #fff; }

    /* ─── Loading Overlay ─────────────────────── */
    .loading-overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    .loading-overlay.show { opacity: 1; pointer-events: all; }
    .spinner {
      width: 40px; height: 40px; border: 3px solid #555;
      border-top-color: #a78bfa; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-overlay p { margin-top: 16px; color: #ccc; font-size: 14px; }

    /* ─── Mode Tabs ───────────────────────────── */
    .mode-tabs { display: flex; gap: 2px; }
    .mode-tab {
      padding: 6px 14px; border-radius: 6px; border: 1px solid #555;
      background: transparent; color: #888; font-size: 12px; cursor: pointer;
    }
    .mode-tab.active { background: #404040; color: #fff; border-color: #666; }
  </style>
</head>
<body>

  <!-- Toolbar -->
  <div class="toolbar">
    <span class="toolbar-logo">⬡ figma-html-import</span>

    <div class="mode-tabs">
      <button class="mode-tab active" data-mode="url">URL</button>
      <button class="mode-tab" data-mode="html">Paste HTML</button>
    </div>

    <input type="text" id="urlInput" value="${targetUrl}" placeholder="Enter URL...">
    <button class="btn btn-secondary" id="loadBtn">Load</button>

    <select id="selectorInput">
      <option value="body">Entire Page</option>
      ${selector ? `<option value="${selector}" selected>${selector}</option>` : ""}
    </select>

    <button class="btn btn-send" id="sendBtn">📤 Send to Figma</button>
  </div>

  <!-- Preview -->
  <div class="preview-container">
    <iframe id="previewFrame" src="${targetUrl}"></iframe>
    <div class="loading-overlay" id="loadingOverlay">
      <div class="spinner"></div>
      <p id="loadingText">Extracting styles...</p>
    </div>
  </div>

  <!-- Status Bar -->
  <div class="status-bar">
    <div>
      <span class="status-dot" id="statusDot"></span>
      <span id="statusText">Checking connection...</span>
    </div>
    <div id="resultText"></div>
  </div>

  <!-- Toast -->
  <div class="toast" id="toast"></div>

  <!-- HTML Paste Mode (hidden by default) -->
  <textarea id="htmlInput" style="display:none; position:absolute; inset:0; width:100%; height:100%; background:#1e1e1e; color:#d4d4d4; border:none; padding:24px; font-family:'Fira Code',monospace; font-size:13px; resize:none; z-index:50;" placeholder="Paste your HTML here..."></textarea>

<script>
  const urlInput = document.getElementById('urlInput');
  const selectorInput = document.getElementById('selectorInput');
  const loadBtn = document.getElementById('loadBtn');
  const sendBtn = document.getElementById('sendBtn');
  const previewFrame = document.getElementById('previewFrame');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const resultText = document.getElementById('resultText');
  const toast = document.getElementById('toast');
  const htmlInput = document.getElementById('htmlInput');
  const modeTabs = document.querySelectorAll('.mode-tab');

  let currentMode = 'url';

  // ─── Mode Tabs ──────────────────────────
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;

      if (currentMode === 'html') {
        previewFrame.style.display = 'none';
        htmlInput.style.display = 'block';
        urlInput.style.display = 'none';
        loadBtn.style.display = 'none';
      } else {
        previewFrame.style.display = 'block';
        htmlInput.style.display = 'none';
        urlInput.style.display = 'block';
        loadBtn.style.display = 'block';
      }
    });
  });

  // ─── Load URL ───────────────────────────
  loadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) previewFrame.src = url;
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  // ─── Check Figma Connection ─────────────
  let isSending = false;
  let checkWs = null;

  function updateConnectionStatus(connected, message) {
    if (connected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = message || 'Figma plugin connected';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = message || 'Not connected';
    }
    // Don't toggle button during an active send
    if (!isSending) {
      sendBtn.disabled = !connected;
    }
  }

  function checkConnection() {
    // Clean up previous check
    if (checkWs) {
      try { checkWs.close(); } catch {}
      checkWs = null;
    }
    try {
      const ws = new WebSocket('ws://localhost:${wsPort}');
      checkWs = ws;
      let resolved = false;

      // Timeout: if no response in 5s, mark as disconnected
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          updateConnectionStatus(false, 'MCP server not responding');
          try { ws.close(); } catch {}
        }
      }, 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'channel_status', channel: 'figma' }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'channel_status_response' && !resolved) {
            resolved = true;
            clearTimeout(timer);
            if (data.otherClients > 0) {
              updateConnectionStatus(true, 'Figma plugin connected');
            } else {
              updateConnectionStatus(false, 'Figma plugin not connected — open the plugin in Figma');
            }
            ws.close();
          } else if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          // ignore system messages
        } catch {}
      };
      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          updateConnectionStatus(false, 'MCP relay not running — start figma-unified-mcp');
        }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        checkWs = null;
      };
    } catch {
      updateConnectionStatus(false, 'Cannot connect');
    }
  }

  checkConnection();
  setInterval(checkConnection, 10000);

  // ─── Show Toast ────────────────────────
  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => { toast.className = 'toast'; }, 4000);
  }

  // ─── Fetch with timeout ────────────────
  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  // ─── Send to Figma ─────────────────────
  sendBtn.addEventListener('click', async () => {
    if (isSending) return;
    isSending = true;
    sendBtn.disabled = true;
    loadingOverlay.classList.add('show');

    try {
      let html;

      if (currentMode === 'html') {
        // Direct HTML paste mode
        html = htmlInput.value;
        if (!html.trim()) {
          showToast('Paste some HTML first', 'error');
          return;
        }
      } else {
        // URL mode: extract via Puppeteer
        loadingText.textContent = 'Extracting HTML & styles (this may take a moment)...';
        const extractRes = await fetchWithTimeout('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: urlInput.value.trim(),
            selector: selectorInput.value,
          }),
        }, 90000); // 90s timeout for complex pages
        if (!extractRes.ok) {
          const errBody = await extractRes.text();
          throw new Error('Extraction failed (' + extractRes.status + '): ' + errBody.slice(0, 200));
        }
        const extractData = await extractRes.json();
        if (extractData.error) throw new Error('Extract: ' + extractData.error);
        html = extractData.html;
        if (!html || !html.trim()) throw new Error('Extraction returned empty HTML');
      }

      // Send to Figma
      loadingText.textContent = 'Converting & sending to Figma...';
      const sendRes = await fetchWithTimeout('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      }, 60000); // 60s timeout for large batches
      if (!sendRes.ok) {
        const errBody = await sendRes.text();
        throw new Error('Send failed (' + sendRes.status + '): ' + errBody.slice(0, 200));
      }
      const sendData = await sendRes.json();

      if (sendData.success) {
        const msg = sendData.succeeded !== undefined
          ? sendData.succeeded + ' nodes created in Figma!'
          : sendData.commandCount + ' commands sent to Figma!';
        showToast('✅ ' + msg, 'success');
        resultText.textContent = msg;
      } else {
        throw new Error(sendData.error || 'Unknown error');
      }
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Request timed out — the page may be too complex or slow'
        : (err.message || 'Unknown error');
      showToast('❌ ' + msg, 'error');
      resultText.textContent = msg;
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      loadingOverlay.classList.remove('show');
    }
  });
</script>

</body>
</html>`;
}
