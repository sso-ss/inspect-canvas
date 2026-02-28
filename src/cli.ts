/**
 * figma-html-import — CLI
 *
 * Usage:
 *   npx figma-html-import ./component.html
 *   echo '<div>Hello</div>' | npx figma-html-import
 *   npx figma-html-import ./page.html --dry-run
 *   npx figma-html-import ./page.html --port 18211 --parent-id "1:2"
 *   npx figma-html-import --url https://example.com
 *   npx figma-html-import --url https://example.com --selector ".hero"
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { htmlToFigma, htmlToCommands } from "./index.js";
import { fetchUrlAsHtml } from "./url-fetcher.js";
import { startPreviewServer } from "./preview-server.js";

interface CliArgs {
  file?: string;
  url?: string;
  port: number;
  parentId?: string;
  dryRun: boolean;
  scale: number;
  baseFont: string;
  baseFontSize: number;
  styles?: string;
  selector?: string;
  viewportWidth: number;
  viewportHeight: number;
  preview: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    port: 18211,
    dryRun: false,
    scale: 1,
    baseFont: "Inter",
    baseFontSize: 16,
    viewportWidth: 1440,
    viewportHeight: 900,
    preview: false,
    help: false,
    version: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--dry-run":
      case "-n":
        args.dryRun = true;
        break;
      case "--port":
      case "-p":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--parent-id":
        args.parentId = argv[++i];
        break;
      case "--scale":
        args.scale = parseFloat(argv[++i]);
        break;
      case "--base-font":
        args.baseFont = argv[++i];
        break;
      case "--base-font-size":
        args.baseFontSize = parseInt(argv[++i], 10);
        break;
      case "--styles":
        args.styles = argv[++i];
        break;
      case "--selector":
        args.selector = argv[++i];
        break;
      case "--url":
      case "-u":
        args.url = argv[++i];
        break;
      case "--viewport-width":
        args.viewportWidth = parseInt(argv[++i], 10);
        break;
      case "--viewport-height":
        args.viewportHeight = parseInt(argv[++i], 10);
        break;
      case "--preview":
        args.preview = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          args.file = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
figma-html-import — Convert HTML/CSS to Figma canvas elements

USAGE:
  figma-html-import <file.html> [options]
  figma-html-import --url <url> [options]
  echo '<div>Hello</div>' | figma-html-import [options]

OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version
  -n, --dry-run           Print generated commands without sending to Figma
  -u, --url <url>         Fetch a live webpage and convert to Figma
  --preview               Open a browser preview with "Send to Figma" button
  -p, --port <port>       MCP relay server WebSocket port (default: 18211)
  --parent-id <id>        Figma parent node ID to insert into
  --scale <n>             Scale factor (default: 1)
  --base-font <name>      Default font family (default: Inter)
  --base-font-size <px>   Root font size for rem (default: 16)
  --styles <css>          Additional CSS to apply
  --selector <sel>        CSS selector to extract (default: body)
  --viewport-width <px>   Browser viewport width (default: 1440)
  --viewport-height <px>  Browser viewport height (default: 900)

EXAMPLES:
  figma-html-import ./card.html
  figma-html-import ./page.html --dry-run
  figma-html-import --url https://example.com
  figma-html-import --url https://example.com --selector ".main-content" --dry-run
  figma-html-import --url https://example.com --preview
  echo '<button style="padding:8px 16px">Click</button>' | figma-html-import --dry-run
`);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");

    // If stdin is a TTY (no pipe), return empty
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    try {
      const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
      console.log(pkg.version);
    } catch {
      console.log("0.1.0");
    }
    process.exit(0);
  }

  // Preview mode: open browser with "Send to Figma" button
  if (args.preview) {
    const previewUrl = args.url || (args.file ? `file://${resolve(args.file)}` : '');
    if (!previewUrl) {
      console.error("--preview requires --url or a file path.");
      console.error("Example: figma-html-import --url https://example.com --preview");
      process.exit(1);
    }
    await startPreviewServer({
      url: previewUrl,
      port: 3100,
      wsPort: args.port,
      selector: args.selector,
    });
    return; // server keeps running
  }

  // Read HTML input
  let html = "";

  if (args.url) {
    // Fetch from URL using headless browser
    try {
      html = await fetchUrlAsHtml(args.url, {
        selector: args.selector,
        viewportWidth: args.viewportWidth,
        viewportHeight: args.viewportHeight,
      });
    } catch (err: any) {
      console.error(`Error fetching URL: ${args.url}`);
      console.error(err.message);
      process.exit(1);
    }
  } else if (args.file) {
    const filePath = resolve(args.file);
    try {
      html = readFileSync(filePath, "utf8");
    } catch (err: any) {
      console.error(`Error reading file: ${filePath}`);
      console.error(err.message);
      process.exit(1);
    }
  } else {
    html = await readStdin();
  }

  if (!html.trim()) {
    console.error("No HTML input. Provide a file path or pipe HTML to stdin.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  const options = {
    wsPort: args.port,
    parentId: args.parentId,
    baseFont: args.baseFont,
    baseFontSize: args.baseFontSize,
    scale: args.scale,
    styles: args.styles,
    selector: args.selector,
  };

  if (args.dryRun) {
    // Print commands as JSON
    const commands = htmlToCommands(html, options);
    console.log(JSON.stringify(commands, null, 2));
    console.error(`\n${commands.length} command(s) generated.`);
  } else {
    // Send to Figma
    console.error("Connecting to Figma plugin bridge...");
    const result = await htmlToFigma(html, options);

    if (result.success) {
      console.error(`✓ Sent ${result.commandCount} commands to Figma`);
      if (result.succeeded !== undefined) {
        console.error(`  ${result.succeeded} succeeded, ${result.failed} failed`);
      }
    } else {
      console.error(`✗ Failed: ${result.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
