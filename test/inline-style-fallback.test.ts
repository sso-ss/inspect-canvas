import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { applyStyleFallback } from "../src/phase2/inline-style-fallback";

const FIXTURES = resolve(__dirname, "fixtures");

describe("inline-style-fallback", () => {
  describe("CSS property name → camelCase conversion", () => {
    it("converts background-color to backgroundColor", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 3,
        cssProperties: { "background-color": "#f0f0f0" },
      });
      expect(result).toContain("backgroundColor");
      expect(result).not.toContain("background-color");
    });

    it("converts multi-hyphen properties", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 3,
        cssProperties: { "border-top-left-radius": "10px" },
      });
      expect(result).toContain("borderTopLeftRadius");
    });

    it("leaves already-camelCase props as-is", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 3,
        cssProperties: { zIndex: "10" },
      });
      expect(result).toContain("zIndex");
    });
  });

  describe("merging with existing styles", () => {
    it("merges into existing style prop without losing values", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 3,
        cssProperties: { "min-height": "200px" },
      });
      expect(result).toContain("maxWidth");
      expect(result).toContain("minHeight");
    });

    it("overwrites conflicting style properties", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "Card.tsx"),
        line: 7,
        cssProperties: { color: "#111" },
      });
      expect(result).toContain('"#111"');
      expect(result).toContain("lineHeight");
    });
  });

  describe("adding style prop to elements without one", () => {
    it("injects style prop on element that has no style", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "Hero.tsx"),
        line: 4,
        cssProperties: { "letter-spacing": "0.05em" },
      });
      expect(result).toContain("style=");
      expect(result).toContain("letterSpacing");
      expect(result).toContain("text-2xl font-bold text-black");
    });
  });

  describe("multiple properties at once", () => {
    it("applies multiple CSS properties in one call", () => {
      const result = applyStyleFallback({
        filePath: resolve(FIXTURES, "NoTailwind.tsx"),
        line: 3,
        cssProperties: {
          "background-color": "linear-gradient(to right, #000, #fff)",
          "backdrop-filter": "blur(10px)",
          "mix-blend-mode": "multiply",
        },
      });
      expect(result).toContain("backgroundColor");
      expect(result).toContain("backdropFilter");
      expect(result).toContain("mixBlendMode");
    });
  });
});
