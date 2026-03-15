/**
 * inspect-canvas — CLI
 *
 * Usage:
 *   npx inspect-canvas http://localhost:5173
 *   npx inspect-canvas ./my-project
 *   npx inspect-canvas http://localhost:3000 --port 4000
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { startInspectServer } from "./preview-server.js";

function printHelp(): void {
  console.log(`
inspect-canvas — Click any element, then tell your AI to update it.

USAGE:
  inspect-canvas <url-or-folder> [options]

OPTIONS:
  -h, --help              Show this help message
  -p, --port <port>       Inspect server port (default: 3100)
  -o, --output <dir>      Directory to write .inspect-canvas.json (default: cwd)
  --no-open               Don't auto-open browser

EXAMPLES:
  inspect-canvas ./my-project
  inspect-canvas http://localhost:5173
  inspect-canvas http://localhost:3000 --port 4000
`);
}

interface CliArgs {
  url?: string;
  port: number;
  outputDir?: string;
  openBrowser: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    port: 3100,
    openBrowser: true,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--port":
      case "-p":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--output":
      case "-o":
        args.outputDir = argv[++i];
        break;
      case "--no-open":
        args.openBrowser = false;
        break;
      default:
        if (!arg.startsWith("-")) {
          args.url = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.url) {
    console.error("Error: provide a URL or folder path to inspect.\n");
    printHelp();
    process.exit(1);
  }

  // Detect if the argument is a local path (file or folder)
  let target = args.url;

  // Strip file:// protocol and decode %20 etc.
  if (target.startsWith("file://")) {
    target = decodeURIComponent(target.replace(/^file:\/\//, ""));
  }

  const isLocal = !target.startsWith("http://") && !target.startsWith("https://");
  if (isLocal) {
    const absPath = resolve(target);
    if (!existsSync(absPath)) {
      console.error(`Error: "${target}" does not exist.`);
      process.exit(1);
    }

    const stat = statSync(absPath);
    if (stat.isFile()) {
      // Single HTML file — serve its parent directory, open that file
      const dir = absPath.substring(0, absPath.lastIndexOf("/")) || ".";
      const filename = absPath.substring(absPath.lastIndexOf("/") + 1);
      await startInspectServer({
        localDir: dir,
        localFile: filename,
        port: args.port,
        outputDir: args.outputDir ?? dir,
        openBrowser: args.openBrowser,
      });
    } else if (stat.isDirectory()) {
      await startInspectServer({
        localDir: absPath,
        port: args.port,
        outputDir: args.outputDir ?? absPath,
        openBrowser: args.openBrowser,
      });
    } else {
      console.error(`Error: "${target}" is not a file or directory.`);
      process.exit(1);
    }
  } else {
    await startInspectServer({
      url: args.url,
      port: args.port,
      outputDir: args.outputDir,
      openBrowser: args.openBrowser,
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
