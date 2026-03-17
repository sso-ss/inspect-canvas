import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { patchNextJsSource } from "../src/phase3/next-patcher";

const TMP = resolve(__dirname, "__tmp_next_patcher__");

const NEXT_PKG = JSON.stringify({ dependencies: { next: "14.0.0", react: "^18" } });

const CLIENT_COMPONENT = `"use client";
import React from "react";

export default function Hero() {
  return (
    <div className="text-xl font-bold bg-white p-4">
      Hello
    </div>
  );
}
`;

const RSC_COMPONENT = `import React from "react";

export default function Page() {
  return <main className="p-4">Content</main>;
}
`;

const SERVER_ACTION = `"use server";

export async function submit(data: FormData) {
  // handle form
}
`;

function makeNextProject(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(resolve(TMP, "package.json"), NEXT_PKG);
  mkdirSync(resolve(TMP, "app"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(TMP, path);
    mkdirSync(resolve(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
}

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("patchNextJsSource", () => {
  it("successfully patches a 'use client' component", async () => {
    makeNextProject({ "app/Hero.tsx": CLIENT_COMPONENT });
    const filePath = resolve(TMP, "app/Hero.tsx");

    const result = await patchNextJsSource({
      filePath,
      line: 6,
      addClasses: ["text-2xl"],
      removeClasses: ["text-xl"],
      setStyles: {},
      projectRoot: TMP,
    });

    expect(result.ok).toBe(true);
    const patched = readFileSync(filePath, "utf-8");
    expect(patched).toContain("text-2xl");
    expect(patched).not.toContain("text-xl");
  });

  it("blocks patching an RSC (no directive in app/ dir)", async () => {
    makeNextProject({ "app/page.tsx": RSC_COMPONENT });
    const filePath = resolve(TMP, "app/page.tsx");

    const result = await patchNextJsSource({
      filePath,
      line: 4,
      addClasses: ["text-2xl"],
      projectRoot: TMP,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rsc");
  });

  it("blocks patching a 'use server' file", async () => {
    makeNextProject({ "app/actions.ts": SERVER_ACTION });
    const filePath = resolve(TMP, "app/actions.ts");

    const result = await patchNextJsSource({
      filePath,
      line: 3,
      addClasses: [],
      projectRoot: TMP,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("server-action");
  });

  it("patches a Pages Router component (no RSC restriction)", async () => {
    mkdirSync(resolve(TMP, "pages"), { recursive: true });
    const pagesComponent = `import React from "react";
export default function Index() {
  return <h1 className="text-lg">Hello</h1>;
}
`;
    writeFileSync(resolve(TMP, "pages/index.tsx"), pagesComponent);

    const result = await patchNextJsSource({
      filePath: resolve(TMP, "pages/index.tsx"),
      line: 3,
      addClasses: ["text-2xl"],
      removeClasses: ["text-lg"],
      projectRoot: TMP,
    });

    // Pages Router files are outside app/ dir → getRscStatus returns "unknown" → patch allowed
    expect(result.ok).toBe(true);
    const patched = readFileSync(resolve(TMP, "pages/index.tsx"), "utf-8");
    expect(patched).toContain("text-2xl");
  });
});
