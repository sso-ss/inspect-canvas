/**
 * figma-html-import — CSS Resolver
 *
 * Resolves CSS styles for each parsed DOM node by merging:
 *   1. User-agent defaults (css-defaults.ts)
 *   2. <style> block rules (matched by selector)
 *   3. Inline styles (highest priority)
 *
 * Uses css-tree for parsing <style> blocks and matching selectors.
 */

import * as cssTree from "css-tree";
import type { ParsedNode, ResolvedStyles, FigmaColor } from "./types.js";
import { getElementDefaults } from "./css-defaults.js";
import { parseColor } from "./color-utils.js";
import { parseLengthToPx, parseShorthand, parseFontWeight } from "./unit-utils.js";

// ─── Font Family Resolution ─────────────────────────────────────────────────

/** Map CSS generic / system font keywords to Figma-available equivalents */
const GENERIC_FONT_MAP: Record<string, string> = {
  "system-ui": "Inter",
  "-apple-system": "Inter",
  "blinkmacsystemfont": "Inter",
  "sans-serif": "Inter",
  "serif": "Georgia",
  "monospace": "Roboto Mono",
  "cursive": "Inter",
  "fantasy": "Inter",
  "ui-sans-serif": "Inter",
  "ui-serif": "Georgia",
  "ui-monospace": "Roboto Mono",
  "ui-rounded": "Inter",
};

/**
 * Resolve a CSS font-family value to the best Figma-compatible font name.
 * Walks the comma-separated list and picks the first non-generic font,
 * falling back to the generic mapping if all are generic.
 */
function resolveFirstFont(val: string): string {
  const families = val.split(",").map(f => f.trim().replace(/['"]/g, ""));
  let genericFallback: string | undefined;

  for (const family of families) {
    const lower = family.toLowerCase();
    // Check if it's a generic/system keyword
    if (GENERIC_FONT_MAP[lower]) {
      if (!genericFallback) genericFallback = GENERIC_FONT_MAP[lower];
      continue;
    }
    // Skip empty
    if (!family) continue;
    // It's a real font name — use it
    return family;
  }

  return genericFallback || "Inter";
}

// ─── Style Rule Storage ─────────────────────────────────────────────────────

interface StyleRule {
  selector: string;
  specificity: number;
  properties: Record<string, string>;
}

/**
 * Parse <style> block CSS text into an array of rules.
 */
export function parseStyleBlocks(cssTexts: string[]): StyleRule[] {
  const rules: StyleRule[] = [];

  for (const cssText of cssTexts) {
    try {
      const ast = cssTree.parse(cssText);
      cssTree.walk(ast, {
        visit: "Rule",
        enter(node: any) {
          if (node.type !== "Rule" || !node.prelude || !node.block) return;

          const selectorText = cssTree.generate(node.prelude);
          const properties: Record<string, string> = {};

          cssTree.walk(node.block, {
            visit: "Declaration",
            enter(decl: any) {
              const prop = decl.property;
              const val = cssTree.generate(decl.value);
              properties[prop] = val;
            },
          });

          // Split comma-separated selectors
          const selectors = selectorText.split(",").map((s) => s.trim());
          for (const sel of selectors) {
            rules.push({
              selector: sel,
              specificity: calculateSpecificity(sel),
              properties,
            });
          }
        },
      });
    } catch {
      // Skip malformed CSS
    }
  }

  return rules;
}

/**
 * Calculate a simplified CSS specificity score.
 * IDs = 100, classes/attributes = 10, elements = 1.
 */
function calculateSpecificity(selector: string): number {
  let score = 0;
  // Count IDs
  score += (selector.match(/#/g) || []).length * 100;
  // Count classes and attribute selectors
  score += (selector.match(/\./g) || []).length * 10;
  score += (selector.match(/\[/g) || []).length * 10;
  // Count element selectors (rough — count words that aren't combinators)
  const elements = selector.replace(/[#.[\]:>+~*]/g, " ").trim().split(/\s+/).filter(Boolean);
  score += elements.length;
  return score;
}

/**
 * Check if a selector matches a given node with its context.
 */
export function selectorMatches(
  selector: string,
  node: ParsedNode,
  ancestors: ParsedNode[] = []
): boolean {
  const trimmed = selector.trim();

  // Child combinator: "parent > child"
  if (trimmed.includes(">")) {
    const parts = trimmed.split(">").map((p) => p.trim());
    const childSel = parts.pop()!;
    const parentSel = parts.join(" > ");
    if (!matchesSimple(childSel, node)) return false;
    if (ancestors.length === 0) return false;
    return selectorMatches(parentSel, ancestors[0], ancestors.slice(1));
  }

  // Descendant combinator: "ancestor descendant"
  if (trimmed.includes(" ")) {
    const parts = trimmed.split(/\s+/);
    const lastSel = parts.pop()!;
    const restSel = parts.join(" ");
    if (!matchesSimple(lastSel, node)) return false;
    // Check any ancestor
    for (let i = 0; i < ancestors.length; i++) {
      if (selectorMatches(restSel, ancestors[i], ancestors.slice(i + 1))) {
        return true;
      }
    }
    return false;
  }

  // Simple selector
  return matchesSimple(trimmed, node);
}

/**
 * Match a simple selector (no combinators) against a node.
 * Supports: element, .class, #id, element.class, .class1.class2
 */
function matchesSimple(selector: string, node: ParsedNode): boolean {
  if (node.type !== "element") return false;

  // Universal selector
  if (selector === "*") return true;

  // Parse selector parts
  const parts = selector.match(/([#.]?[a-zA-Z0-9_-]+)/g);
  if (!parts) return false;

  for (const part of parts) {
    if (part.startsWith("#")) {
      // ID selector
      if (node.id !== part.slice(1)) return false;
    } else if (part.startsWith(".")) {
      // Class selector
      if (!node.classList?.includes(part.slice(1))) return false;
    } else {
      // Element selector
      if (node.tag !== part.toLowerCase()) return false;
    }
  }

  return true;
}

// ─── Inline Style Parsing ───────────────────────────────────────────────────

/**
 * Parse an inline style string ("color: red; font-size: 16px") into key-value pairs.
 */
export function parseInlineStyle(style: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!style) return props;

  // Split by semicolons (but not inside parentheses)
  const declarations = style.split(";").map((d) => d.trim()).filter(Boolean);
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (prop && val) {
      props[prop] = val;
    }
  }
  return props;
}

// ─── Property Resolution ────────────────────────────────────────────────────

interface ResolveContext {
  baseFontSize: number;
  parentFontSize: number;
}

/**
 * Convert raw CSS property map to ResolvedStyles.
 */
export function resolveProperties(
  props: Record<string, string>,
  ctx: ResolveContext
): Partial<ResolvedStyles> {
  const styles: Partial<ResolvedStyles> = {};
  const lengthCtx = { baseFontSize: ctx.baseFontSize, parentFontSize: ctx.parentFontSize };

  for (const [prop, val] of Object.entries(props)) {
    switch (prop) {
      // ── Display / Layout ───────────────────────────────────────────
      case "display":
        styles.display = val;
        break;
      case "flex-direction":
        styles.flexDirection = val;
        break;
      case "justify-content":
        styles.justifyContent = val;
        break;
      case "align-items":
        styles.alignItems = val;
        break;
      case "flex-wrap":
        styles.flexWrap = val;
        break;
      case "flex-grow": {
        const fg = parseFloat(val);
        if (!isNaN(fg)) styles.flexGrow = fg;
        break;
      }
      case "flex-shrink": {
        const fs = parseFloat(val);
        if (!isNaN(fs)) styles.flexShrink = fs;
        break;
      }
      case "align-self":
        styles.alignSelf = val;
        break;
      case "gap": {
        const gapParts = val.split(/\s+/);
        const g = parseLengthToPx(gapParts[0], lengthCtx);
        if (g !== null) {
          styles.rowGap = g;
          styles.columnGap = gapParts[1] ? (parseLengthToPx(gapParts[1], lengthCtx) ?? g) : g;
          styles.gap = g;
        }
        break;
      }
      case "row-gap": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.rowGap = v;
        break;
      }
      case "column-gap": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.columnGap = v;
        break;
      }

      // ── Sizing ─────────────────────────────────────────────────────
      case "width":
        if (val.endsWith("%") || val === "auto" || val === "100%") {
          styles.width = val;
        } else {
          const w = parseLengthToPx(val, lengthCtx);
          if (w !== null) styles.width = w;
        }
        break;
      case "height":
        if (val.endsWith("%") || val === "auto") {
          styles.height = val;
        } else {
          const h = parseLengthToPx(val, lengthCtx);
          if (h !== null) styles.height = h;
        }
        break;
      case "min-width": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.minWidth = v;
        break;
      }
      case "max-width": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.maxWidth = v;
        break;
      }
      case "min-height": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.minHeight = v;
        break;
      }
      case "max-height": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.maxHeight = v;
        break;
      }

      // ── Padding ────────────────────────────────────────────────────
      case "padding": {
        const sh = parseShorthand(val);
        const t = parseLengthToPx(sh.top, lengthCtx);
        const r = parseLengthToPx(sh.right, lengthCtx);
        const b = parseLengthToPx(sh.bottom, lengthCtx);
        const l = parseLengthToPx(sh.left, lengthCtx);
        if (t !== null) styles.paddingTop = t;
        if (r !== null) styles.paddingRight = r;
        if (b !== null) styles.paddingBottom = b;
        if (l !== null) styles.paddingLeft = l;
        break;
      }
      case "padding-top": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.paddingTop = v;
        break;
      }
      case "padding-right": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.paddingRight = v;
        break;
      }
      case "padding-bottom": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.paddingBottom = v;
        break;
      }
      case "padding-left": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.paddingLeft = v;
        break;
      }

      // ── Margin ─────────────────────────────────────────────────────
      case "margin": {
        const sh = parseShorthand(val);
        const t = parseLengthToPx(sh.top, lengthCtx);
        const r = parseLengthToPx(sh.right, lengthCtx);
        const b = parseLengthToPx(sh.bottom, lengthCtx);
        const l = parseLengthToPx(sh.left, lengthCtx);
        if (t !== null) styles.marginTop = t;
        if (r !== null) styles.marginRight = r;
        if (b !== null) styles.marginBottom = b;
        if (l !== null) styles.marginLeft = l;
        break;
      }
      case "margin-top": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.marginTop = v;
        break;
      }
      case "margin-right": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.marginRight = v;
        break;
      }
      case "margin-bottom": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.marginBottom = v;
        break;
      }
      case "margin-left": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.marginLeft = v;
        break;
      }

      // ── Background ─────────────────────────────────────────────────
      case "background-color": {
        const c = parseColor(val);
        if (c) styles.backgroundColor = c;
        break;
      }
      case "background": {
        // Try to extract solid color; also try gradient first color as fallback
        const c = parseColor(val);
        if (c) {
          styles.backgroundColor = c;
        } else if (val.includes('gradient')) {
          styles.backgroundImage = val;
          // Extract the first color from gradient as solid-color fallback
          const colorMatch = val.match(/rgba?\([^)]+\)/i);
          if (colorMatch) {
            const gc = parseColor(colorMatch[0]);
            if (gc) styles.backgroundColor = gc;
          }
        }
        break;
      }

      case "background-image": {
        if (val && val !== 'none') {
          styles.backgroundImage = val;
          // Extract first color from gradient as fallback background-color
          if (val.includes('gradient') && !styles.backgroundColor) {
            const colorMatch = val.match(/rgba?\([^)]+\)/i);
            if (colorMatch) {
              const gc = parseColor(colorMatch[0]);
              if (gc) styles.backgroundColor = gc;
            }
          }
        }
        break;
      }

      // ── Border ─────────────────────────────────────────────────────
      case "border": {
        const borderParts = val.split(/\s+/);
        for (const part of borderParts) {
          const w = parseLengthToPx(part, lengthCtx);
          if (w !== null) {
            styles.borderWidth = w;
            continue;
          }
          if (["solid", "dashed", "dotted", "double", "none", "hidden"].includes(part)) {
            styles.borderStyle = part;
            continue;
          }
          const c = parseColor(part);
          if (c) styles.borderColor = c;
        }
        if (val === "none" || val === "0") {
          styles.borderWidth = 0;
        }
        break;
      }
      case "border-width": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.borderWidth = v;
        break;
      }
      case "border-color": {
        const c = parseColor(val);
        if (c) styles.borderColor = c;
        break;
      }
      case "border-style":
        styles.borderStyle = val;
        break;

      // ── Individual border-side properties (URL fetcher inlines these) ───
      case "border-top-color":
      case "border-right-color":
      case "border-bottom-color":
      case "border-left-color": {
        const c = parseColor(val);
        if (c) styles.borderColor = c;
        break;
      }
      case "border-top-width":
      case "border-right-width":
      case "border-bottom-width":
      case "border-left-width": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.borderWidth = v;
        break;
      }
      case "border-top-style":
      case "border-right-style":
      case "border-bottom-style":
      case "border-left-style":
        if (val !== "none") styles.borderStyle = val;
        break;

      // ── Border Radius ──────────────────────────────────────────────
      case "border-radius": {
        const sh = parseShorthand(val);
        const tl = parseLengthToPx(sh.top, lengthCtx);
        const tr = parseLengthToPx(sh.right, lengthCtx);
        const br = parseLengthToPx(sh.bottom, lengthCtx);
        const bl = parseLengthToPx(sh.left, lengthCtx);
        // If all same, use single value
        if (tl === tr && tr === br && br === bl && tl !== null) {
          styles.borderRadius = tl;
        } else {
          if (tl !== null) styles.borderTopLeftRadius = tl;
          if (tr !== null) styles.borderTopRightRadius = tr;
          if (br !== null) styles.borderBottomRightRadius = br;
          if (bl !== null) styles.borderBottomLeftRadius = bl;
        }
        break;
      }
      case "border-top-left-radius": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) {
          styles.borderTopLeftRadius = v;
        } else if (val.endsWith("%")) {
          const pct = parseFloat(val);
          if (!isNaN(pct) && typeof styles.width === "number" && typeof styles.height === "number") {
            styles.borderTopLeftRadius = (pct / 100) * Math.min(styles.width as number, styles.height as number);
          }
        }
        break;
      }
      case "border-top-right-radius": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) {
          styles.borderTopRightRadius = v;
        } else if (val.endsWith("%")) {
          const pct = parseFloat(val);
          if (!isNaN(pct) && typeof styles.width === "number" && typeof styles.height === "number") {
            styles.borderTopRightRadius = (pct / 100) * Math.min(styles.width as number, styles.height as number);
          }
        }
        break;
      }
      case "border-bottom-right-radius": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) {
          styles.borderBottomRightRadius = v;
        } else if (val.endsWith("%")) {
          const pct = parseFloat(val);
          if (!isNaN(pct) && typeof styles.width === "number" && typeof styles.height === "number") {
            styles.borderBottomRightRadius = (pct / 100) * Math.min(styles.width as number, styles.height as number);
          }
        }
        break;
      }
      case "border-bottom-left-radius": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) {
          styles.borderBottomLeftRadius = v;
        } else if (val.endsWith("%")) {
          const pct = parseFloat(val);
          if (!isNaN(pct) && typeof styles.width === "number" && typeof styles.height === "number") {
            styles.borderBottomLeftRadius = (pct / 100) * Math.min(styles.width as number, styles.height as number);
          }
        }
        break;
      }

      // ── Opacity ────────────────────────────────────────────────────
      case "opacity": {
        const o = parseFloat(val);
        if (!isNaN(o)) styles.opacity = Math.max(0, Math.min(1, o));
        break;
      }

      // ── Overflow ───────────────────────────────────────────────────
      case "overflow":
        styles.overflow = val;
        break;

      // ── Typography ─────────────────────────────────────────────────
      case "font-family":
        // Strip quotes, take first usable family (skip generic CSS keywords)
        styles.fontFamily = resolveFirstFont(val);
        break;
      case "font-size": {
        const sz = parseLengthToPx(val, lengthCtx);
        if (sz !== null) styles.fontSize = sz;
        break;
      }
      case "font-weight": {
        const fw = parseFontWeight(val);
        if (fw !== null) styles.fontWeight = fw;
        break;
      }
      case "font-style":
        if (val !== 'normal') styles.fontStyle = val;
        break;
      case "line-height": {
        if (val === "normal") {
          styles.lineHeight = "normal";
        } else {
          const lh = parseLengthToPx(val, lengthCtx);
          if (lh !== null) {
            styles.lineHeight = lh;
          } else {
            // Unitless multiplier
            const mul = parseFloat(val);
            if (!isNaN(mul)) styles.lineHeight = mul;
          }
        }
        break;
      }
      case "letter-spacing": {
        const ls = parseLengthToPx(val, lengthCtx);
        if (ls !== null) styles.letterSpacing = ls;
        break;
      }
      case "text-align":
        styles.textAlign = val;
        break;
      case "text-transform":
        styles.textTransform = val;
        break;
      case "text-decoration":
      case "text-decoration-line":
        styles.textDecoration = val.split(/\s+/)[0]; // Take first value
        break;
      case "color": {
        const c = parseColor(val);
        if (c) styles.color = c;
        break;
      }

      // ── Box Shadow ─────────────────────────────────────────────────
      case "box-shadow":
        styles.boxShadow = val;
        break;

      // ── Position ───────────────────────────────────────────────────
      case "position":
        styles.position = val;
        break;
      case "top": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.top = v;
        break;
      }
      case "left": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.left = v;
        break;
      }
      case "right": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.right = v;
        break;
      }
      case "bottom": {
        const v = parseLengthToPx(val, lengthCtx);
        if (v !== null) styles.bottom = v;
        break;
      }
      case "z-index": {
        const z = parseInt(val, 10);
        if (!isNaN(z)) styles.zIndex = z;
        break;
      }

      // ── Visibility ─────────────────────────────────────────────────
      case "visibility":
        styles.visibility = val;
        break;
    }
  }

  return styles;
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve styles for a node by merging:
 *   1. Element defaults
 *   2. <style> block rules (ordered by specificity)
 *   3. Inline styles
 */
export function resolveNodeStyles(
  node: ParsedNode,
  styleRules: StyleRule[],
  ancestors: ParsedNode[],
  ctx: ResolveContext
): ResolvedStyles {
  // 1. Element defaults
  const defaults = node.tag ? getElementDefaults(node.tag) : {};

  // 2. Matched <style> rules (sorted by specificity)
  const matchedRules = styleRules
    .filter((rule) => selectorMatches(rule.selector, node, ancestors))
    .sort((a, b) => a.specificity - b.specificity);

  let mergedRuleProps: Record<string, string> = {};
  for (const rule of matchedRules) {
    mergedRuleProps = { ...mergedRuleProps, ...rule.properties };
  }
  const resolvedRuleStyles = resolveProperties(mergedRuleProps, ctx);

  // 3. Inline styles (highest priority)
  const inlineProps = parseInlineStyle(node.inlineStyle || "");
  const resolvedInlineStyles = resolveProperties(inlineProps, ctx);

  // Merge: defaults < rules < inline
  return {
    ...defaults,
    ...resolvedRuleStyles,
    ...resolvedInlineStyles,
  } as ResolvedStyles;
}

/**
 * Resolve CSS custom properties (--var) from :root or <style> blocks.
 */
export function resolveCustomProperties(cssTexts: string[]): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const cssText of cssTexts) {
    try {
      const ast = cssTree.parse(cssText);
      cssTree.walk(ast, {
        visit: "Declaration",
        enter(node: any) {
          const prop = node.property;
          if (prop.startsWith("--")) {
            vars[prop] = cssTree.generate(node.value);
          }
        },
      });
    } catch {
      // Skip malformed CSS
    }
  }

  return vars;
}
