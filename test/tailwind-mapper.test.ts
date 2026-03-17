import { describe, it, expect } from "vitest";
import { cssToTailwind } from "../src/phase2/tailwind-mapper";

describe("tailwind-mapper", () => {
  describe("font-size → text-*", () => {
    it.each([
      ["12px", "text-xs"],
      ["14px", "text-sm"],
      ["16px", "text-base"],
      ["18px", "text-lg"],
      ["20px", "text-xl"],
      ["24px", "text-2xl"],
      ["30px", "text-3xl"],
      ["36px", "text-4xl"],
      ["48px", "text-5xl"],
      ["60px", "text-6xl"],
    ])("font-size %s → %s", (value, expected) => {
      expect(cssToTailwind("font-size", value)).toBe(expected);
    });
  });

  describe("font-weight → font-*", () => {
    it.each([
      ["100", "font-thin"],
      ["300", "font-light"],
      ["400", "font-normal"],
      ["500", "font-medium"],
      ["600", "font-semibold"],
      ["700", "font-bold"],
      ["800", "font-extrabold"],
      ["900", "font-black"],
    ])("font-weight %s → %s", (value, expected) => {
      expect(cssToTailwind("font-weight", value)).toBe(expected);
    });
  });

  describe("colors → Tailwind color classes", () => {
    it.each([
      ["color", "#3B82F6", "text-blue-500"],
      ["color", "#EF4444", "text-red-500"],
      ["color", "#10B981", "text-emerald-500"],
      ["color", "#000000", "text-black"],
      ["color", "#FFFFFF", "text-white"],
      ["background-color", "#3B82F6", "bg-blue-500"],
      ["background-color", "#F3F4F6", "bg-gray-100"],
      ["border-color", "#E5E7EB", "border-gray-200"],
    ])("%s %s → %s", (prop, value, expected) => {
      expect(cssToTailwind(prop, value)).toBe(expected);
    });

    it("handles rgb() format", () => {
      expect(cssToTailwind("color", "rgb(59, 130, 246)")).toBe("text-blue-500");
    });

    it("handles lowercase hex", () => {
      expect(cssToTailwind("color", "#3b82f6")).toBe("text-blue-500");
    });
  });

  describe("spacing → p-*, m-*, gap-*", () => {
    it.each([
      ["padding", "4px", "p-1"],
      ["padding", "8px", "p-2"],
      ["padding", "16px", "p-4"],
      ["padding", "32px", "p-8"],
      ["margin", "4px", "m-1"],
      ["margin", "8px", "m-2"],
      ["margin", "16px", "m-4"],
      ["margin-top", "8px", "mt-2"],
      ["margin-bottom", "16px", "mb-4"],
      ["padding-left", "24px", "pl-6"],
      ["padding-right", "24px", "pr-6"],
      ["gap", "8px", "gap-2"],
      ["gap", "16px", "gap-4"],
    ])("%s %s → %s", (prop, value, expected) => {
      expect(cssToTailwind(prop, value)).toBe(expected);
    });
  });

  describe("border-radius → rounded-*", () => {
    it.each([
      ["4px", "rounded"],
      ["6px", "rounded-md"],
      ["8px", "rounded-lg"],
      ["12px", "rounded-xl"],
      ["16px", "rounded-2xl"],
      ["9999px", "rounded-full"],
      ["0px", "rounded-none"],
    ])("border-radius %s → %s", (value, expected) => {
      expect(cssToTailwind("border-radius", value)).toBe(expected);
    });
  });

  describe("display & layout", () => {
    it.each([
      ["display", "flex", "flex"],
      ["display", "grid", "grid"],
      ["display", "block", "block"],
      ["display", "inline", "inline"],
      ["display", "none", "hidden"],
      ["display", "inline-flex", "inline-flex"],
      ["align-items", "center", "items-center"],
      ["align-items", "flex-start", "items-start"],
      ["align-items", "flex-end", "items-end"],
      ["justify-content", "center", "justify-center"],
      ["justify-content", "space-between", "justify-between"],
      ["justify-content", "flex-start", "justify-start"],
      ["flex-direction", "column", "flex-col"],
      ["flex-direction", "row", "flex-row"],
    ])("%s: %s → %s", (prop, value, expected) => {
      expect(cssToTailwind(prop, value)).toBe(expected);
    });
  });

  describe("opacity", () => {
    it.each([
      ["0", "opacity-0"],
      ["0.5", "opacity-50"],
      ["0.75", "opacity-75"],
      ["1", "opacity-100"],
    ])("opacity %s → %s", (value, expected) => {
      expect(cssToTailwind("opacity", value)).toBe(expected);
    });
  });

  describe("width & height", () => {
    it.each([
      ["width", "100%", "w-full"],
      ["width", "auto", "w-auto"],
      ["width", "100vw", "w-screen"],
      ["height", "100%", "h-full"],
      ["height", "100vh", "h-screen"],
      ["height", "auto", "h-auto"],
      ["min-height", "100vh", "min-h-screen"],
    ])("%s %s → %s", (prop, value, expected) => {
      expect(cssToTailwind(prop, value)).toBe(expected);
    });
  });

  describe("returns null for unmapped values", () => {
    it("returns null for exotic color", () => {
      expect(cssToTailwind("color", "#123456")).toBeNull();
    });
    it("returns null for non-standard font-size", () => {
      expect(cssToTailwind("font-size", "17px")).toBeNull();
    });
    it("returns null for unknown property", () => {
      expect(cssToTailwind("animation-delay", "200ms")).toBeNull();
    });
  });
});
