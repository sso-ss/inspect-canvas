import { patchJsxSource } from "./ast-source-patcher";

export interface StyleFallbackOptions {
  filePath: string;
  line: number;
  cssProperties: Record<string, string>;
}

/** Convert CSS kebab-case property to camelCase */
function toCamelCase(prop: string): string {
  // Already camelCase (no hyphens) → return as-is
  if (!prop.includes("-")) return prop;
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * When Tailwind has no matching class, injects inline style={{}} props
 * on the JSX element at the given line. Converts CSS property names to camelCase.
 */
export function applyStyleFallback(options: StyleFallbackOptions): string {
  const { filePath, line, cssProperties } = options;

  const camelStyles: Record<string, string> = {};
  for (const [key, value] of Object.entries(cssProperties)) {
    camelStyles[toCamelCase(key)] = value;
  }

  return patchJsxSource({ filePath, line, setStyles: camelStyles });
}
