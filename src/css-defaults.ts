/**
 * figma-html-import — CSS Defaults
 *
 * Simplified user-agent stylesheet defaults for common HTML elements.
 * These are applied as the base layer before inline/class styles.
 */

import type { ResolvedStyles } from "./types.js";

type PartialStyles = Partial<ResolvedStyles>;

/**
 * Default styles per HTML element — simplified browser defaults.
 */
export const CSS_DEFAULTS: Record<string, PartialStyles> = {
  // Body / root
  body: { display: "flex", flexDirection: "column" },

  // Block containers
  div: { display: "flex", flexDirection: "column" },
  section: { display: "flex", flexDirection: "column" },
  article: { display: "flex", flexDirection: "column" },
  nav: { display: "flex", flexDirection: "column" },
  header: { display: "flex", flexDirection: "column" },
  footer: { display: "flex", flexDirection: "column" },
  main: { display: "flex", flexDirection: "column" },
  aside: { display: "flex", flexDirection: "column" },
  form: { display: "flex", flexDirection: "column" },
  fieldset: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 }, paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12 },

  // Headings
  h1: { fontSize: 32, fontWeight: 700, marginTop: 21, marginBottom: 21, display: "block" },
  h2: { fontSize: 24, fontWeight: 700, marginTop: 19, marginBottom: 19, display: "block" },
  h3: { fontSize: 18.7, fontWeight: 700, marginTop: 18, marginBottom: 18, display: "block" },
  h4: { fontSize: 16, fontWeight: 700, marginTop: 21, marginBottom: 21, display: "block" },
  h5: { fontSize: 13.3, fontWeight: 700, marginTop: 22, marginBottom: 22, display: "block" },
  h6: { fontSize: 10.7, fontWeight: 700, marginTop: 25, marginBottom: 25, display: "block" },

  // Text
  p: { fontSize: 16, marginTop: 16, marginBottom: 16, display: "block" },
  span: { display: "inline" },
  a: { display: "inline", textDecoration: "underline", color: { r: 0, g: 0, b: 0.93, a: 1 } },
  strong: { display: "inline", fontWeight: 700 },
  b: { display: "inline", fontWeight: 700 },
  em: { display: "inline" },
  i: { display: "inline" },
  u: { display: "inline", textDecoration: "underline" },
  s: { display: "inline", textDecoration: "strikethrough" },
  small: { display: "inline", fontSize: 13 },
  code: { display: "inline", fontFamily: "monospace" },
  pre: { display: "block", fontFamily: "monospace", fontSize: 13 },
  blockquote: { display: "flex", flexDirection: "column", marginLeft: 40, marginRight: 40, marginTop: 16, marginBottom: 16 },
  label: { display: "inline" },

  // Lists
  ul: { display: "flex", flexDirection: "column", paddingLeft: 40, marginTop: 16, marginBottom: 16 },
  ol: { display: "flex", flexDirection: "column", paddingLeft: 40, marginTop: 16, marginBottom: 16 },
  li: { display: "flex", flexDirection: "row" },

  // Interactive
  button: {
    display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center",
    paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
    fontSize: 14, fontWeight: 400,
    borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 },
    backgroundColor: { r: 0.94, g: 0.94, b: 0.94, a: 1 },
    borderRadius: 4,
  },
  input: {
    display: "flex", flexDirection: "row",
    paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
    fontSize: 14,
    borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 },
    borderRadius: 4,
  },
  textarea: {
    display: "flex", flexDirection: "column",
    paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
    fontSize: 14,
    borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 },
    borderRadius: 4,
  },
  select: {
    display: "flex", flexDirection: "row",
    paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8,
    fontSize: 14,
    borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 },
  },

  // Media
  img: { display: "block" },
  figure: { display: "flex", flexDirection: "column", marginTop: 16, marginBottom: 16, marginLeft: 40, marginRight: 40 },
  figcaption: { display: "block", fontSize: 14 },

  // Table
  table: { display: "flex", flexDirection: "column", borderWidth: 1, borderColor: { r: 0.75, g: 0.75, b: 0.75, a: 1 } },
  thead: { display: "flex", flexDirection: "column" },
  tbody: { display: "flex", flexDirection: "column" },
  tfoot: { display: "flex", flexDirection: "column" },
  tr: { display: "flex", flexDirection: "row" },
  th: { display: "flex", flexDirection: "column", fontWeight: 700, paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8 },
  td: { display: "flex", flexDirection: "column", paddingTop: 4, paddingRight: 8, paddingBottom: 4, paddingLeft: 8 },

  // Separator
  hr: { display: "block", marginTop: 8, marginBottom: 8 },
};

/**
 * Get default styles for an HTML element.
 */
export function getElementDefaults(tag: string): PartialStyles {
  return CSS_DEFAULTS[tag.toLowerCase()] || { display: "flex", flexDirection: "column" };
}
