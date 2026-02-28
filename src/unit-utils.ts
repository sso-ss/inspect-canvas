/**
 * figma-html-import — Unit Utilities
 *
 * Convert CSS units (px, rem, em, %, vw, vh, pt) to px values.
 */

import { parseColor } from "./color-utils.js";

/**
 * Parse a CSS length value to pixels.
 * Returns the numeric px value, or null if unparseable.
 */
export function parseLengthToPx(
  value: string,
  context: {
    baseFontSize?: number;   // root font size for rem (default: 16)
    parentFontSize?: number; // parent font size for em
    containerWidth?: number; // for % width
    containerHeight?: number;// for % height
    viewportWidth?: number;  // for vw
    viewportHeight?: number; // for vh
  } = {}
): number | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();

  // Plain number (treated as px)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 0 (any unit)
  if (trimmed === "0") return 0;

  // auto, none, inherit, initial
  if (["auto", "none", "inherit", "initial", "unset", "max-content", "min-content", "fit-content"].includes(trimmed)) {
    return null;
  }

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh|vmin|vmax|pt|cm|mm|in|pc)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case "px":
      return num;
    case "rem":
      return num * (context.baseFontSize || 16);
    case "em":
      return num * (context.parentFontSize || context.baseFontSize || 16);
    case "%":
      // Context-dependent — caller decides if width or height
      return null; // Return null; caller handles % specially
    case "vw":
      return num * (context.viewportWidth || 1440) / 100;
    case "vh":
      return num * (context.viewportHeight || 900) / 100;
    case "vmin":
      return num * Math.min(context.viewportWidth || 1440, context.viewportHeight || 900) / 100;
    case "vmax":
      return num * Math.max(context.viewportWidth || 1440, context.viewportHeight || 900) / 100;
    case "pt":
      return num * (4 / 3); // 1pt = 1.333px
    case "cm":
      return num * 37.7953;
    case "mm":
      return num * 3.77953;
    case "in":
      return num * 96;
    case "pc":
      return num * 16;
    default:
      return null;
  }
}

/**
 * Parse a CSS numeric value that might be unitless or have px/rem/em.
 * For font-size, line-height, etc.
 */
export function parseNumericValue(
  value: string,
  context: { baseFontSize?: number; parentFontSize?: number } = {}
): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  // Pure number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  return parseLengthToPx(trimmed, context);
}

/**
 * Parse CSS shorthand values (1–4 values) into top/right/bottom/left.
 * Used for padding, margin, border-width, border-radius.
 */
export function parseShorthand(value: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = value.trim().split(/\s+/);

  switch (parts.length) {
    case 1:
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    case 2:
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    case 3:
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    case 4:
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    default:
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
}

/**
 * Parse font-weight keyword to numeric value.
 */
export function parseFontWeight(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  const weights: Record<string, number> = {
    thin: 100,
    hairline: 100,
    extralight: 200,
    ultralight: 200,
    light: 300,
    normal: 400,
    regular: 400,
    medium: 500,
    semibold: 600,
    demibold: 600,
    bold: 700,
    bolder: 700,
    lighter: 300,
    extrabold: 800,
    ultrabold: 800,
    black: 900,
    heavy: 900,
  };

  if (weights[trimmed] !== undefined) return weights[trimmed];

  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 1000) return num;

  return null;
}

/**
 * Parse CSS box-shadow into Figma effect parameters.
 * Supports: offset-x offset-y blur spread? color
 */
export function parseBoxShadow(value: string): Array<{
  type: "DROP_SHADOW" | "INNER_SHADOW";
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: { r: number; g: number; b: number; a: number };
}> {
  if (!value || value === "none") return [];

  const shadows: ReturnType<typeof parseBoxShadow> = [];

  // Split multiple shadows by comma (but not inside parentheses)
  const parts = splitOutsideParens(value, ",");

  for (const part of parts) {
    const trimmed = part.trim();
    const isInset = trimmed.startsWith("inset");
    const cleaned = trimmed.replace(/^inset\s*/, "").trim();

    // Extract color (could be at start or end)
    let colorStr = "";
    let rest = cleaned;

    // Try color at end: "0 4px 6px rgba(0,0,0,0.1)"
    const rgbMatch = cleaned.match(/(rgba?\([^)]+\))\s*$/);
    const hslMatch = cleaned.match(/(hsla?\([^)]+\))\s*$/);
    const hexMatch = cleaned.match(/(#[0-9a-fA-F]{3,8})\s*$/);
    const namedMatch = cleaned.match(/\s+([a-zA-Z]+)\s*$/);

    if (rgbMatch) {
      colorStr = rgbMatch[1];
      rest = cleaned.slice(0, -rgbMatch[0].length).trim();
    } else if (hslMatch) {
      colorStr = hslMatch[1];
      rest = cleaned.slice(0, -hslMatch[0].length).trim();
    } else if (hexMatch) {
      colorStr = hexMatch[1];
      rest = cleaned.slice(0, -hexMatch[0].length).trim();
    } else if (namedMatch) {
      colorStr = namedMatch[1];
      rest = cleaned.slice(0, -namedMatch[0].length).trim();
    }

    const nums = rest.split(/\s+/).map((n) => parseLengthToPx(n) ?? 0);
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = nums;

    const parsedColor = colorStr ? parseColor(colorStr) : null;

    shadows.push({
      type: isInset ? "INNER_SHADOW" : "DROP_SHADOW",
      offsetX,
      offsetY,
      blur,
      spread,
      color: parsedColor
        ? { r: parsedColor.r, g: parsedColor.g, b: parsedColor.b, a: parsedColor.a ?? 1 }
        : { r: 0, g: 0, b: 0, a: 0.25 },
    });
  }

  return shadows;
}

/** Split a string by separator, but not inside parentheses */
function splitOutsideParens(str: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of str) {
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}
