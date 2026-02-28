import { describe, it, expect } from "vitest";
import { parseColor } from "../src/color-utils.js";
import { parseLengthToPx, parseShorthand, parseFontWeight, parseBoxShadow } from "../src/unit-utils.js";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    const c = parseColor("#ff0000");
    expect(c).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("parses 3-digit hex", () => {
    const c = parseColor("#f00");
    expect(c).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("parses 8-digit hex with alpha", () => {
    const c = parseColor("#ff000080");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(1);
    expect(c!.a).toBeCloseTo(0.502, 1);
  });

  it("parses rgb()", () => {
    const c = parseColor("rgb(255, 128, 0)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(1);
    expect(c!.g).toBeCloseTo(0.502, 1);
    expect(c!.b).toBe(0);
  });

  it("parses rgba()", () => {
    const c = parseColor("rgba(0, 0, 0, 0.5)");
    expect(c).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it("parses hsl()", () => {
    const c = parseColor("hsl(0, 100%, 50%)");
    expect(c).not.toBeNull();
    expect(c!.r).toBeCloseTo(1, 1);
    expect(c!.g).toBeCloseTo(0, 1);
    expect(c!.b).toBeCloseTo(0, 1);
  });

  it("parses named colors", () => {
    expect(parseColor("red")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor("white")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("returns null for invalid", () => {
    expect(parseColor("notacolor")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("parseLengthToPx", () => {
  it("parses px values", () => {
    expect(parseLengthToPx("16px")).toBe(16);
    expect(parseLengthToPx("0.5px")).toBe(0.5);
  });

  it("parses rem values", () => {
    expect(parseLengthToPx("1rem", { baseFontSize: 16 })).toBe(16);
    expect(parseLengthToPx("2rem", { baseFontSize: 16 })).toBe(32);
  });

  it("parses em values", () => {
    expect(parseLengthToPx("1.5em", { parentFontSize: 16 })).toBe(24);
  });

  it("parses 0", () => {
    expect(parseLengthToPx("0")).toBe(0);
  });

  it("parses plain numbers", () => {
    expect(parseLengthToPx("16")).toBe(16);
  });

  it("returns null for unparseable", () => {
    expect(parseLengthToPx("auto")).toBeNull();
    expect(parseLengthToPx("")).toBeNull();
  });

  it("parses pt values", () => {
    expect(parseLengthToPx("12pt")).toBeCloseTo(16, 0);
  });
});

describe("parseShorthand", () => {
  it("handles 1 value", () => {
    const r = parseShorthand("16px");
    expect(r).toEqual({ top: "16px", right: "16px", bottom: "16px", left: "16px" });
  });

  it("handles 2 values", () => {
    const r = parseShorthand("8px 16px");
    expect(r).toEqual({ top: "8px", right: "16px", bottom: "8px", left: "16px" });
  });

  it("handles 3 values", () => {
    const r = parseShorthand("8px 16px 24px");
    expect(r).toEqual({ top: "8px", right: "16px", bottom: "24px", left: "16px" });
  });

  it("handles 4 values", () => {
    const r = parseShorthand("1px 2px 3px 4px");
    expect(r).toEqual({ top: "1px", right: "2px", bottom: "3px", left: "4px" });
  });
});

describe("parseFontWeight", () => {
  it("parses numeric weights", () => {
    expect(parseFontWeight("400")).toBe(400);
    expect(parseFontWeight("700")).toBe(700);
  });

  it("parses keyword weights", () => {
    expect(parseFontWeight("bold")).toBe(700);
    expect(parseFontWeight("normal")).toBe(400);
    expect(parseFontWeight("lighter")).toBe(300);
  });
});

describe("parseBoxShadow", () => {
  it("parses a simple shadow", () => {
    const result = parseBoxShadow("0 4px 6px rgba(0,0,0,0.1)");
    expect(result).toHaveLength(1);
    expect(result[0].offsetX).toBe(0);
    expect(result[0].offsetY).toBe(4);
    expect(result[0].blur).toBe(6);
    expect(result[0].type).toBe("DROP_SHADOW");
  });

  it("parses inset shadow", () => {
    const result = parseBoxShadow("inset 0 2px 4px rgba(0,0,0,0.1)");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("INNER_SHADOW");
  });

  it("returns empty for none", () => {
    expect(parseBoxShadow("none")).toEqual([]);
  });
});
