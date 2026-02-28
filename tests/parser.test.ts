import { describe, it, expect } from "vitest";
import { parseHtml, getTextContent, isBlockElement, isInlineElement } from "../src/parser.js";

describe("parseHtml", () => {
  it("parses a simple div with text", () => {
    const { root } = parseHtml("<div>Hello</div>");
    expect(root.type).toBe("root");
    expect(root.children).toHaveLength(1);
    const div = root.children[0];
    expect(div.type).toBe("element");
    expect(div.tag).toBe("div");
    expect(div.children).toHaveLength(1);
    expect(div.children[0].text).toBe("Hello");
  });

  it("parses nested elements", () => {
    const { root } = parseHtml("<div><p>Text</p></div>");
    const div = root.children[0];
    expect(div.tag).toBe("div");
    expect(div.children).toHaveLength(1);
    expect(div.children[0].tag).toBe("p");
  });

  it("extracts inline styles", () => {
    const { root } = parseHtml('<div style="color: red; padding: 16px">Hi</div>');
    const div = root.children[0];
    expect(div.inlineStyle).toBe("color: red; padding: 16px");
  });

  it("extracts class list and id", () => {
    const { root } = parseHtml('<div id="main" class="card primary">Hi</div>');
    const div = root.children[0];
    expect(div.id).toBe("main");
    expect(div.classList).toEqual(["card", "primary"]);
  });

  it("extracts style blocks", () => {
    const { root, styleBlocks } = parseHtml(`
      <style>.card { padding: 16px; }</style>
      <div class="card">Hi</div>
    `);
    expect(styleBlocks).toHaveLength(1);
    expect(styleBlocks[0]).toContain(".card");
    expect(styleBlocks[0]).toContain("padding: 16px");
  });

  it("skips script tags", () => {
    const { root } = parseHtml("<div>Hello<script>alert(1)</script></div>");
    const div = root.children[0];
    // script should be removed, only text child
    const hasScript = div.children.some((c) => c.tag === "script");
    expect(hasScript).toBe(false);
  });

  it("unwraps html/body", () => {
    const { root } = parseHtml("<html><body><p>Hello</p></body></html>");
    // Should unwrap to just the p tag
    expect(root.children.length).toBeGreaterThan(0);
    const findP = (node: any): boolean => {
      if (node.tag === "p") return true;
      return (node.children || []).some(findP);
    };
    expect(findP(root)).toBe(true);
  });

  it("handles self-closing tags", () => {
    const { root } = parseHtml('<div><img src="test.png" /><br /></div>');
    const div = root.children[0];
    const img = div.children.find((c) => c.tag === "img");
    expect(img).toBeDefined();
    expect(img!.attributes?.src).toBe("test.png");
  });

  it("removes whitespace-only text nodes", () => {
    const { root } = parseHtml("<div>  \n  </div>");
    const div = root.children[0];
    // Whitespace-only text should be removed
    expect(div.children).toHaveLength(0);
  });
});

describe("getTextContent", () => {
  it("returns text from text nodes", () => {
    const { root } = parseHtml("<p>Hello World</p>");
    const p = root.children[0];
    expect(getTextContent(p)).toBe("Hello World");
  });

  it("concatenates nested text", () => {
    const { root } = parseHtml("<p>Hello <strong>World</strong></p>");
    const p = root.children[0];
    expect(getTextContent(p)).toBe("Hello World");
  });
});

describe("isBlockElement / isInlineElement", () => {
  it("identifies block elements", () => {
    expect(isBlockElement("div")).toBe(true);
    expect(isBlockElement("p")).toBe(true);
    expect(isBlockElement("h1")).toBe(true);
    expect(isBlockElement("section")).toBe(true);
  });

  it("identifies inline elements", () => {
    expect(isInlineElement("span")).toBe(true);
    expect(isInlineElement("a")).toBe(true);
    expect(isInlineElement("strong")).toBe(true);
    expect(isInlineElement("em")).toBe(true);
  });

  it("doesn't cross-match", () => {
    expect(isBlockElement("span")).toBe(false);
    expect(isInlineElement("div")).toBe(false);
  });
});
