/**
 * figma-html-import — HTML Parser
 *
 * Parses HTML string into a simplified DOM AST using htmlparser2.
 * Extracts inline styles, class names, IDs, and text content.
 */

import { parseDocument } from "htmlparser2";
import type { ParsedNode } from "./types.js";

// htmlparser2 node types
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

/**
 * Parse an HTML string into a simplified AST.
 * Strips <script>, <style> (extracted separately), comments, and whitespace-only text nodes.
 */
export function parseHtml(html: string): { root: ParsedNode; styleBlocks: string[] } {
  const doc = parseDocument(html) as unknown as DomNode;
  const styleBlocks: string[] = [];

  function convert(node: DomNode): ParsedNode | null {
    // Text node
    if (node.type === "text") {
      const text = node.data || "";
      // Skip whitespace-only text nodes
      if (!text.trim()) return null;
      // Preserve internal whitespace but normalize runs
      const normalized = text.replace(/\s+/g, " ");
      return {
        type: "text",
        text: normalized,
        children: [],
      };
    }

    // Element node
    if (node.type === "tag" || node.type === "script" || node.type === "style") {
      const tag = (node.name || "").toLowerCase();

      // Extract <style> blocks, don't include in tree
      if (tag === "style") {
        const cssText = node.children
          ?.filter((c) => c.type === "text")
          .map((c) => c.data || "")
          .join("");
        if (cssText) styleBlocks.push(cssText);
        return null;
      }

      // Skip script tags entirely
      if (tag === "script") return null;

      // Skip head, meta, link, title
      if (["head", "meta", "link", "title", "base", "noscript"].includes(tag)) return null;

      const attribs = node.attribs || {};
      const classList = attribs.class
        ? attribs.class.split(/\s+/).filter(Boolean)
        : undefined;

      const parsed: ParsedNode = {
        type: "element",
        tag,
        attributes: Object.keys(attribs).length > 0 ? attribs : undefined,
        inlineStyle: attribs.style || undefined,
        classList: classList && classList.length > 0 ? classList : undefined,
        id: attribs.id || undefined,
        children: [],
      };

      // Process children
      if (node.children) {
        for (const child of node.children) {
          const converted = convert(child);
          if (converted) {
            parsed.children.push(converted);
          }
        }
      }

      // Unwrap <html> — pass through its children to root level
      // Keep <body> as a regular element so its styles (background, font, etc.) are preserved
      if (tag === "html") {
        return {
          type: "root",
          children: parsed.children,
        };
      }

      return parsed;
    }

    return null;
  }

  // Process root document children
  const rootChildren: ParsedNode[] = [];

  function collectChildren(node: DomNode) {
    if (node.children) {
      for (const child of node.children) {
        const converted = convert(child);
        if (converted) {
          if (converted.type === "root") {
            // Unwrap root-type nodes (html)
            rootChildren.push(...converted.children);
          } else {
            rootChildren.push(converted);
          }
        }
      }
    }
  }

  collectChildren(doc);

  return {
    root: {
      type: "root",
      children: rootChildren,
    },
    styleBlocks,
  };
}

/**
 * Get text content from a node and all descendants.
 */
export function getTextContent(node: ParsedNode): string {
  if (node.type === "text") return node.text || "";
  return node.children.map(getTextContent).join("");
}

/**
 * Check if a node is a block-level element.
 */
const BLOCK_ELEMENTS = new Set([
  "div", "section", "article", "nav", "header", "footer", "main", "aside",
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "form", "fieldset",
  "table", "thead", "tbody", "tfoot", "tr",
  "blockquote", "pre", "figure", "figcaption",
  "details", "summary",
  "hr",
]);

export function isBlockElement(tag: string): boolean {
  return BLOCK_ELEMENTS.has(tag.toLowerCase());
}

/**
 * Check if a node is an inline element.
 */
const INLINE_ELEMENTS = new Set([
  "span", "a", "strong", "b", "em", "i", "u", "s", "small",
  "code", "kbd", "var", "samp", "mark", "sub", "sup",
  "abbr", "cite", "q", "time",
]);

export function isInlineElement(tag: string): boolean {
  return INLINE_ELEMENTS.has(tag.toLowerCase());
}

/**
 * Check if a node is a void/self-closing element.
 */
const VOID_ELEMENTS = new Set([
  "img", "br", "hr", "input", "meta", "link", "area", "base",
  "col", "embed", "source", "track", "wbr",
]);

export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}
