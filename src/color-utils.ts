/**
 * figma-html-import — Color Utilities
 *
 * Parse CSS color values (hex, rgb, rgba, hsl, hsla, named) into Figma {r,g,b,a} (0–1 range).
 */

import type { FigmaColor } from "./types.js";

// ─── Named CSS Colors (subset — most commonly used) ────────────────────────

const NAMED_COLORS: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  gold: "#ffd700",
  navy: "#000080",
  teal: "#008080",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  fuchsia: "#ff00ff",
  coral: "#ff7f50",
  salmon: "#fa8072",
  tomato: "#ff6347",
  crimson: "#dc143c",
  indianred: "#cd5c5c",
  darkred: "#8b0000",
  firebrick: "#b22222",
  orangered: "#ff4500",
  darkorange: "#ff8c00",
  lightyellow: "#ffffe0",
  khaki: "#f0e68c",
  darkkhaki: "#bdb76b",
  lawngreen: "#7cfc00",
  chartreuse: "#7fff00",
  limegreen: "#32cd32",
  forestgreen: "#228b22",
  darkgreen: "#006400",
  seagreen: "#2e8b57",
  springgreen: "#00ff7f",
  mediumseagreen: "#3cb371",
  lightgreen: "#90ee90",
  palegreen: "#98fb98",
  darkcyan: "#008b8b",
  lightcyan: "#e0ffff",
  cadetblue: "#5f9ea0",
  steelblue: "#4682b4",
  lightsteelblue: "#b0c4de",
  dodgerblue: "#1e90ff",
  cornflowerblue: "#6495ed",
  deepskyblue: "#00bfff",
  skyblue: "#87ceeb",
  lightskyblue: "#87cefa",
  royalblue: "#4169e1",
  mediumblue: "#0000cd",
  darkblue: "#00008b",
  midnightblue: "#191970",
  mediumpurple: "#9370db",
  blueviolet: "#8a2be2",
  darkviolet: "#9400d3",
  darkorchid: "#9932cc",
  mediumorchid: "#ba55d3",
  orchid: "#da70d6",
  plum: "#dda0dd",
  violet: "#ee82ee",
  indigo: "#4b0082",
  slateblue: "#6a5acd",
  darkslateblue: "#483d8b",
  rebeccapurple: "#663399",
  hotpink: "#ff69b4",
  deeppink: "#ff1493",
  mediumvioletred: "#c71585",
  lightpink: "#ffb6c1",
  mistyrose: "#ffe4e1",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  linen: "#faf0e6",
  oldlace: "#fdf5e6",
  antiquewhite: "#faebd7",
  bisque: "#ffe4c4",
  blanchedalmond: "#ffebcd",
  wheat: "#f5deb3",
  burlywood: "#deb887",
  tan: "#d2b48c",
  sandybrown: "#f4a460",
  chocolate: "#d2691e",
  saddlebrown: "#8b4513",
  sienna: "#a0522d",
  peru: "#cd853f",
  brown: "#a52a2a",
  rosybrown: "#bc8f8f",
  darkgoldenrod: "#b8860b",
  goldenrod: "#daa520",
  lightgoldenrodyellow: "#fafad2",
  palegoldenrod: "#eee8aa",
  cornsilk: "#fff8dc",
  ivory: "#fffff0",
  beige: "#f5f5dc",
  lightyellow2: "#ffffe0",
  snow: "#fffafa",
  honeydew: "#f0fff0",
  mintcream: "#f5fffa",
  azure: "#f0ffff",
  aliceblue: "#f0f8ff",
  ghostwhite: "#f8f8ff",
  whitesmoke: "#f5f5f5",
  floralwhite: "#fffaf0",
  seashell: "#fff5ee",
  gainsboro: "#dcdcdc",
  lightgrey: "#d3d3d3",
  lightgray: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  dimgray: "#696969",
  dimgrey: "#696969",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  slategray: "#708090",
  slategrey: "#708090",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
};

/**
 * Parse a CSS color string into Figma RGBA (0–1 range).
 * Returns null if the color cannot be parsed.
 */
export function parseColor(value: string): FigmaColor | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();

  // transparent
  if (trimmed === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // inherit/initial/unset/currentcolor — skip
  if (["inherit", "initial", "unset", "currentcolor", "none"].includes(trimmed)) {
    return null;
  }

  // Named color
  if (NAMED_COLORS[trimmed]) {
    return parseHex(NAMED_COLORS[trimmed]);
  }

  // Hex
  if (trimmed.startsWith("#")) {
    return parseHex(trimmed);
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?%?)\s*[,\s]\s*(\d+(?:\.\d+)?%?)\s*[,\s]\s*(\d+(?:\.\d+)?%?)\s*(?:[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/
  );
  if (rgbMatch) {
    return {
      r: parseColorChannel(rgbMatch[1]) / 255,
      g: parseColorChannel(rgbMatch[2]) / 255,
      b: parseColorChannel(rgbMatch[3]) / 255,
      a: rgbMatch[4] !== undefined ? parseAlpha(rgbMatch[4]) : 1,
    };
  }

  // hsl() / hsla()
  const hslMatch = trimmed.match(
    /^hsla?\(\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*(?:[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const a = hslMatch[4] !== undefined ? parseAlpha(hslMatch[4]) : 1;
    const rgb = hslToRgb(h, s, l);
    return { ...rgb, a };
  }

  return null;
}

function parseHex(hex: string): FigmaColor | null {
  let h = hex.replace("#", "");

  // 3-digit → 6-digit
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  // 4-digit → 8-digit
  if (h.length === 4) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }

  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: 1,
    };
  }

  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }

  return null;
}

function parseColorChannel(val: string): number {
  if (val.endsWith("%")) {
    return (parseFloat(val) / 100) * 255;
  }
  return parseFloat(val);
}

function parseAlpha(val: string): number {
  if (val.endsWith("%")) {
    return parseFloat(val) / 100;
  }
  return parseFloat(val);
}

/**
 * Convert HSL to RGB (all 0–1 range for output).
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  const hNorm = h / 360;

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, hNorm + 1 / 3),
    g: hueToRgb(p, q, hNorm),
    b: hueToRgb(p, q, hNorm - 1 / 3),
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
