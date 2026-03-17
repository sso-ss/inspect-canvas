import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { detectNextProject, getRscStatus } from "../src/phase3/next-detector";

const TMP = resolve(__dirname, "__tmp_next_detector__");

function makeProject(pkg: object, dirs: string[] = [], files: Record<string, string> = {}) {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(resolve(TMP, "package.json"), JSON.stringify(pkg));
  for (const dir of dirs) mkdirSync(resolve(TMP, dir), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(TMP, path);
    mkdirSync(resolve(TMP, path, ".."), { recursive: true });
    writeFileSync(full, content);
  }
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("detectNextProject", () => {
  it("returns isNextJs=false for non-Next project", () => {
    makeProject({ dependencies: { react: "^18" } });
    const info = detectNextProject(TMP);
    expect(info.isNextJs).toBe(false);
  });

  it("detects Next.js from dependencies", () => {
    makeProject({ dependencies: { next: "14.0.0", react: "^18" } }, ["app"]);
    const info = detectNextProject(TMP);
    expect(info.isNextJs).toBe(true);
    expect(info.nextVersion).toBe("14.0.0");
  });

  it("detects App Router when app/ directory exists", () => {
    makeProject({ dependencies: { next: "14.0.0" } }, ["app"]);
    const info = detectNextProject(TMP);
    expect(info.isAppRouter).toBe(true);
    expect(info.isPagesRouter).toBe(false);
  });

  it("detects Pages Router when pages/ directory exists", () => {
    makeProject({ dependencies: { next: "14.0.0" } }, ["pages"]);
    const info = detectNextProject(TMP);
    expect(info.isPagesRouter).toBe(true);
    expect(info.isAppRouter).toBe(false);
  });

  it("detects both routers when both directories exist", () => {
    makeProject({ dependencies: { next: "14.0.0" } }, ["app", "pages"]);
    const info = detectNextProject(TMP);
    expect(info.isAppRouter).toBe(true);
    expect(info.isPagesRouter).toBe(true);
  });

  it("detects App Router under src/app", () => {
    makeProject({ dependencies: { next: "14.0.0" } }, ["src/app"]);
    const info = detectNextProject(TMP);
    expect(info.isAppRouter).toBe(true);
  });
});

describe("getRscStatus", () => {
  it("returns unknown for non-Next.js project", () => {
    makeProject({ dependencies: { react: "^18" } });
    const status = getRscStatus(resolve(TMP, "app/page.tsx"), TMP);
    expect(status).toBe("unknown");
  });

  it("returns unknown for file outside app/ dir", () => {
    makeProject({ dependencies: { next: "14.0.0" } }, ["app", "components"]);
    writeFileSync(resolve(TMP, "components/Button.tsx"), "export default function Button() {}");
    const status = getRscStatus(resolve(TMP, "components/Button.tsx"), TMP);
    expect(status).toBe("unknown");
  });

  it("returns client for file with 'use client'", () => {
    makeProject(
      { dependencies: { next: "14.0.0" } },
      ["app"],
      { "app/Hero.tsx": '"use client";\nexport default function Hero() {}' }
    );
    const status = getRscStatus(resolve(TMP, "app/Hero.tsx"), TMP);
    expect(status).toBe("client");
  });

  it("returns server-action for file with 'use server'", () => {
    makeProject(
      { dependencies: { next: "14.0.0" } },
      ["app"],
      { "app/actions.ts": '"use server";\nexport async function submit() {}' }
    );
    const status = getRscStatus(resolve(TMP, "app/actions.ts"), TMP);
    expect(status).toBe("server-action");
  });

  it("returns rsc for App Router file with no directive", () => {
    makeProject(
      { dependencies: { next: "14.0.0" } },
      ["app"],
      { "app/page.tsx": "export default function Page() { return <main />; }" }
    );
    const status = getRscStatus(resolve(TMP, "app/page.tsx"), TMP);
    expect(status).toBe("rsc");
  });
});
