import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { patchJsxSource } from "../src/phase2/ast-source-patcher";

const FIXTURES = resolve(__dirname, "fixtures");

describe("ast-source-patcher", () => {
  describe("className modifications", () => {
    it("appends a Tailwind class to existing className", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Hero.tsx"),
        line: 4,
        addClasses: ["text-blue-500"],
      });
      expect(result).toContain("text-2xl font-bold");
      expect(result).toContain("text-blue-500");
    });

    it("removes a class and adds a replacement", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Hero.tsx"),
        line: 4,
        removeClasses: ["text-black"],
        addClasses: ["text-red-600"],
      });
      expect(result).toContain("text-red-600");
      expect(result).not.toContain("text-black");
    });

    it("adds className prop when none exists", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 4,
        addClasses: ["text-3xl", "font-bold"],
      });
      expect(result).toContain('className="text-3xl font-bold"');
    });

    it("preserves other props when adding className", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 4,
        addClasses: ["rounded-lg"],
      });
      expect(result).toContain("w-full rounded-lg");
      expect(result).toContain('src="/hero.png"');
      expect(result).toContain('alt="Hero"');
    });
  });

  describe("inline style modifications", () => {
    it("merges styles into existing style prop", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 3,
        setStyles: { backgroundColor: "#F9FAFB" },
      });
      expect(result).toContain("maxWidth");
      expect(result).toContain("backgroundColor");
    });

    it("adds style prop when none exists", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 3,
        setStyles: { padding: "20px" },
      });
      expect(result).toContain("style=");
      expect(result).toContain("padding");
    });

    it("overwrites existing style value", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 7,
        setStyles: { color: "#333" },
      });
      expect(result).toContain('"#333"');
      expect(result).toContain("lineHeight");
    });
  });

  describe("combined className + style changes", () => {
    it("modifies both className and style in one pass", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 3,
        addClasses: ["bg-white"],
        setStyles: { minHeight: "200px" },
      });
      expect(result).toContain("bg-white");
      expect(result).toContain("minHeight");
    });
  });

  describe("preserves file structure", () => {
    it("returns valid JSX that could be written back", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Hero.tsx"),
        line: 3,
        addClasses: ["bg-gray-50"],
      });
      expect(result).toContain("export function Hero()");
      expect(result).toContain("return (");
      expect(result).toContain("Hello World");
      expect(result).toContain("Subtitle here");
    });

    it("does not corrupt deeply nested JSX", () => {
      const result = patchJsxSource({
        filePath: resolve(FIXTURES, "Nested.tsx"),
        line: 6,
        addClasses: ["text-blue-600"],
        removeClasses: ["text-lg"],
      });
      expect(result).toContain("text-blue-600");
      expect(result).toContain('className="min-h-screen"');
      expect(result).toContain('className="flex gap-4"');
    });
  });

  describe("error handling", () => {
    it("throws on non-existent file", () => {
      expect(() =>
        patchJsxSource({
          filePath: resolve(FIXTURES, "DoesNotExist.tsx"),
          line: 1,
          addClasses: ["test"],
        })
      ).toThrow();
    });

    it("throws when line has no JSX element", () => {
      expect(() =>
        patchJsxSource({
          filePath: resolve(FIXTURES, "Hero.tsx"),
          line: 1,
          addClasses: ["test"],
        })
      ).toThrow();
    });
  });
});
