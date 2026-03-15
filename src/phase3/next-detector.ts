/**
 * inspect-canvas — Phase 3: Next.js Detector
 *
 * Detects whether a project root is a Next.js project and, if so,
 * whether a given source file is an App Router server component
 * ("use server" or "use client" absent in App Router file = RSC by default).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

export interface NextProjectInfo {
  isNextJs: boolean;
  isAppRouter: boolean;
  isPagesRouter: boolean;
  nextVersion: string | null;
}

/**
 * Detect whether projectRoot is a Next.js project and which router it uses.
 */
export function detectNextProject(projectRoot: string): NextProjectInfo {
  const pkgPath = resolve(projectRoot, "package.json");
  if (!existsSync(pkgPath)) {
    return { isNextJs: false, isAppRouter: false, isPagesRouter: false, nextVersion: null };
  }

  let pkg: Record<string, any>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return { isNextJs: false, isAppRouter: false, isPagesRouter: false, nextVersion: null };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const nextVersion: string | null = deps["next"] ?? null;
  if (!nextVersion) {
    return { isNextJs: false, isAppRouter: false, isPagesRouter: false, nextVersion: null };
  }

  const hasAppDir =
    existsSync(resolve(projectRoot, "app")) ||
    existsSync(resolve(projectRoot, "src", "app"));

  const hasPagesDir =
    existsSync(resolve(projectRoot, "pages")) ||
    existsSync(resolve(projectRoot, "src", "pages"));

  return {
    isNextJs: true,
    isAppRouter: hasAppDir,
    isPagesRouter: hasPagesDir,
    nextVersion,
  };
}

export type RscStatus = "rsc" | "client" | "server-action" | "unknown";

/**
 * Determines the React Server Component status of a file.
 *
 * - "client"        — has "use client" directive → safe to patch className/style
 * - "server-action" — has "use server" directive → DO NOT patch, skip silently
 * - "rsc"           — App Router file with no directive → RSC by default, skip styling
 * - "unknown"       — not in App Router scope or not a Next.js project
 */
export function getRscStatus(filePath: string, projectRoot: string): RscStatus {
  const info = detectNextProject(projectRoot);
  if (!info.isNextJs || !info.isAppRouter) return "unknown";

  // Determine if this file sits inside the app/ directory
  const appDir = existsSync(resolve(projectRoot, "src", "app"))
    ? resolve(projectRoot, "src", "app")
    : resolve(projectRoot, "app");

  const rel = relative(projectRoot, filePath);
  const isInAppDir = !rel.startsWith("..") && rel.split(sep)[0] === "app" ||
    rel.startsWith("src" + sep + "app");

  if (!isInAppDir) return "unknown";

  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return "unknown";
  }

  // Check for directives in the first non-empty lines
  const firstLines = source.split("\n").slice(0, 5).join("\n");
  if (/"use client"/.test(firstLines) || /'use client'/.test(firstLines)) return "client";
  if (/"use server"/.test(firstLines) || /'use server'/.test(firstLines)) return "server-action";

  // App Router file with no directive = RSC by default
  return "rsc";
}
