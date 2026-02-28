import { describe, it, expect } from "vitest";
import {
  parseStyleBlocks,
  selectorMatches,
  parseInlineStyle,
  resolveNodeStyles,
  resolveProperties,
} from "../src/css-resolver.js";
import type { ParsedNode } from "../src/types.js";

describe("parseInlineStyle", () => {
  it("parses key-value pairs", () => {
    const result = parseInlineStyle("color: red; padding: 16px");
    expect(result).toEqual({ color: "red", padding: "16px" });
  });

  it("handles empty string", () => {
    expect(parseInlineStyle("")).toEqual({});
  });

  it("handles trailing semicolons", () => {
    const result = parseInlineStyle("color: red;");
    expect(result).toEqual({ color: "red" });
  });
});

describe("parseStyleBlocks", () => {
  it("parses CSS rules", () => {
    const rules = parseStyleBlocks([".card { padding: 16px; color: red; }"]);
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toBe(".card");
    expect(rules[0].properties.padding).toBe("16px");
    expect(rules[0].properties.color).toBe("red");
  });

  it("splits comma selectors", () => {
    const rules = parseStyleBlocks([".a, .b { color: blue; }"]);
    expect(rules).toHaveLength(2);
    expect(rules[0].selector).toBe(".a");
    expect(rules[1].selector).toBe(".b");
  });

  it("skips malformed CSS", () => {
    const rules = parseStyleBlocks(["not { valid { css"]);
    // Should not throw
    expect(Array.isArray(rules)).toBe(true);
  });
});

describe("selectorMatches", () => {
  const makeNode = (tag: string, opts: Partial<ParsedNode> = {}): ParsedNode => ({
    type: "element",
    tag,
    children: [],
    ...opts,
  });

  it("matches element selector", () => {
    const node = makeNode("div");
    expect(selectorMatches("div", node)).toBe(true);
    expect(selectorMatches("p", node)).toBe(false);
  });

  it("matches class selector", () => {
    const node = makeNode("div", { classList: ["card", "primary"] });
    expect(selectorMatches(".card", node)).toBe(true);
    expect(selectorMatches(".primary", node)).toBe(true);
    expect(selectorMatches(".other", node)).toBe(false);
  });

  it("matches ID selector", () => {
    const node = makeNode("div", { id: "main" });
    expect(selectorMatches("#main", node)).toBe(true);
    expect(selectorMatches("#other", node)).toBe(false);
  });

  it("matches compound selector", () => {
    const node = makeNode("div", { classList: ["card"] });
    expect(selectorMatches("div.card", node)).toBe(true);
    expect(selectorMatches("span.card", node)).toBe(false);
  });

  it("matches descendant selector", () => {
    const parent = makeNode("div", { classList: ["container"] });
    const child = makeNode("p");
    expect(selectorMatches(".container p", child, [parent])).toBe(true);
    expect(selectorMatches(".other p", child, [parent])).toBe(false);
  });

  it("matches child combinator", () => {
    const parent = makeNode("div", { classList: ["card"] });
    const child = makeNode("h2");
    expect(selectorMatches(".card > h2", child, [parent])).toBe(true);
  });

  it("matches universal selector", () => {
    const node = makeNode("anything");
    expect(selectorMatches("*", node)).toBe(true);
  });
});

describe("resolveProperties", () => {
  const ctx = { baseFontSize: 16, parentFontSize: 16 };

  it("resolves display", () => {
    const result = resolveProperties({ display: "flex" }, ctx);
    expect(result.display).toBe("flex");
  });

  it("resolves padding shorthand", () => {
    const result = resolveProperties({ padding: "8px 16px" }, ctx);
    expect(result.paddingTop).toBe(8);
    expect(result.paddingRight).toBe(16);
    expect(result.paddingBottom).toBe(8);
    expect(result.paddingLeft).toBe(16);
  });

  it("resolves background-color", () => {
    const result = resolveProperties({ "background-color": "#ff0000" }, ctx);
    expect(result.backgroundColor).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("resolves font-size in rem", () => {
    const result = resolveProperties({ "font-size": "1.5rem" }, ctx);
    expect(result.fontSize).toBe(24);
  });

  it("resolves border shorthand", () => {
    const result = resolveProperties({ border: "1px solid #000000" }, ctx);
    expect(result.borderWidth).toBe(1);
    expect(result.borderStyle).toBe("solid");
    expect(result.borderColor).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("resolves opacity", () => {
    const result = resolveProperties({ opacity: "0.5" }, ctx);
    expect(result.opacity).toBe(0.5);
  });

  it("resolves border-radius", () => {
    const result = resolveProperties({ "border-radius": "8px" }, ctx);
    expect(result.borderRadius).toBe(8);
  });
});

describe("resolveNodeStyles", () => {
  const ctx = { baseFontSize: 16, parentFontSize: 16 };

  it("merges inline styles over element defaults", () => {
    const node: ParsedNode = {
      type: "element",
      tag: "h1",
      children: [],
      inlineStyle: "font-size: 48px",
    };
    const rules = parseStyleBlocks([]);
    const styles = resolveNodeStyles(node, rules, [], ctx);
    expect(styles.fontSize).toBe(48);
    // Should still have bold from defaults
    expect(styles.fontWeight).toBe(700);
  });

  it("merges style rules over defaults", () => {
    const node: ParsedNode = {
      type: "element",
      tag: "div",
      classList: ["card"],
      children: [],
    };
    const rules = parseStyleBlocks([".card { padding: 24px; background-color: blue; }"]);
    const styles = resolveNodeStyles(node, rules, [], ctx);
    expect(styles.paddingTop).toBe(24);
    expect(styles.backgroundColor).toBeDefined();
  });

  it("inline overrides class rules", () => {
    const node: ParsedNode = {
      type: "element",
      tag: "div",
      classList: ["card"],
      children: [],
      inlineStyle: "padding: 8px",
    };
    const rules = parseStyleBlocks([".card { padding: 24px; }"]);
    const styles = resolveNodeStyles(node, rules, [], ctx);
    expect(styles.paddingTop).toBe(8); // Inline wins
  });
});
