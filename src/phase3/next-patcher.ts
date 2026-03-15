/**
 * inspect-canvas — Phase 3: Next.js Source Patcher
 *
 * Wraps the Phase 2 JSX patcher with Next.js-specific behaviour:
 *  - Blocks patching of RSC / "use server" files (safe-by-default)
 *  - Notifies the Next.js HMR dev server after a successful patch
 *    so the browser hot-reloads without a manual refresh
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { patchJsxSource, type PatchOptions } from "../phase2/ast-source-patcher.js";
import { getRscStatus, detectNextProject } from "./next-detector.js";

export interface NextPatchOptions {
  /** Absolute path to the .tsx/.jsx file to patch */
  filePath: string;
  /** 1-based line number of the JSX element */
  line: number;
  /** Tailwind classes to add */
  addClasses?: string[];
  /** Tailwind classes to remove (conflicting old values) */
  removeClasses?: string[];
  /** Inline style properties to set as fallback */
  setStyles?: Record<string, string>;
  /** Project root (used to resolve package.json and app/ dir) */
  projectRoot: string;
  /** Port the Next.js dev server is running on (default: 3000) */
  nextDevPort?: number;
}

export type NextPatchResult =
  | { ok: true; hmrNotified: boolean }
  | { ok: false; reason: "rsc" | "server-action" | "parse-error"; message: string };

/**
 * Patch a Next.js JSX/TSX source file.
 *
 * Refuses to patch RSC and "use server" files to avoid breaking
 * server/client boundaries. Triggers HMR after a successful patch.
 */
export async function patchNextJsSource(options: NextPatchOptions): Promise<NextPatchResult> {
  const { filePath, line, addClasses, removeClasses, setStyles, projectRoot, nextDevPort = 3000 } = options;

  // ── Guard: check RSC status ──────────────────────────────────────────────
  const rscStatus = getRscStatus(filePath, projectRoot);

  if (rscStatus === "server-action") {
    return {
      ok: false,
      reason: "server-action",
      message: `${filePath} has "use server" — cannot patch styles on a server action file`,
    };
  }

  if (rscStatus === "rsc") {
    return {
      ok: false,
      reason: "rsc",
      message: `${filePath} is a React Server Component (no "use client"). Add "use client" at the top to enable visual editing.`,
    };
  }

  // ── Patch ────────────────────────────────────────────────────────────────
  try {
    const patched = patchJsxSource({ filePath, line, addClasses, removeClasses, setStyles });
    writeFileSync(filePath, patched);
  } catch (err: any) {
    return { ok: false, reason: "parse-error", message: err.message };
  }

  // ── HMR notification ─────────────────────────────────────────────────────
  const hmrNotified = await notifyNextHmr(projectRoot, filePath, nextDevPort);

  return { ok: true, hmrNotified };
}

/**
 * Pings the Next.js dev server's on-demand revalidation / HMR endpoint
 * so it picks up the source change and pushes a hot update to the browser.
 *
 * Next.js ≥13 watches the filesystem, so a file write alone is usually enough.
 * This function additionally touches the file mtime and pings /__nextjs_original
 * as a belt-and-suspenders measure. Failure is non-fatal.
 */
async function notifyNextHmr(
  projectRoot: string,
  filePath: string,
  devPort: number
): Promise<boolean> {
  // Touch the file to ensure filesystem watchers fire
  try {
    const now = new Date();
    const { utimesSync } = await import("node:fs");
    utimesSync(filePath, now, now);
  } catch {
    // non-fatal
  }

  // Check if Next.js dev server is reachable and ping its internal HMR endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const res = await fetch(`http://localhost:${devPort}/__nextjs_original-stack-frame`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    // Any response (even 404) means the dev server is alive — file touch is enough
    return res.status < 500;
  } catch {
    return false;
  }
}
