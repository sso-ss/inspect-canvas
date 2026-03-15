/**
 * Maps a CSS property + value to the equivalent Tailwind CSS class.
 * Returns null when no standard Tailwind class matches.
 */

const FONT_SIZE: Record<string, string> = {
  "12px": "text-xs", "14px": "text-sm", "16px": "text-base",
  "18px": "text-lg", "20px": "text-xl", "24px": "text-2xl",
  "30px": "text-3xl", "36px": "text-4xl", "48px": "text-5xl",
  "60px": "text-6xl",
};

const FONT_WEIGHT: Record<string, string> = {
  "100": "font-thin", "300": "font-light", "400": "font-normal",
  "500": "font-medium", "600": "font-semibold", "700": "font-bold",
  "800": "font-extrabold", "900": "font-black",
};

const BORDER_RADIUS: Record<string, string> = {
  "0px": "rounded-none", "4px": "rounded", "6px": "rounded-md",
  "8px": "rounded-lg", "12px": "rounded-xl", "16px": "rounded-2xl",
  "9999px": "rounded-full",
};

const DISPLAY: Record<string, string> = {
  "flex": "flex", "grid": "grid", "block": "block",
  "inline": "inline", "none": "hidden", "inline-flex": "inline-flex",
};

const ALIGN_ITEMS: Record<string, string> = {
  "center": "items-center", "flex-start": "items-start",
  "flex-end": "items-end", "stretch": "items-stretch",
  "baseline": "items-baseline",
};

const JUSTIFY_CONTENT: Record<string, string> = {
  "center": "justify-center", "space-between": "justify-between",
  "flex-start": "justify-start", "flex-end": "justify-end",
  "space-around": "justify-around", "space-evenly": "justify-evenly",
};

const FLEX_DIRECTION: Record<string, string> = {
  "column": "flex-col", "row": "flex-row",
  "column-reverse": "flex-col-reverse", "row-reverse": "flex-row-reverse",
};

const OPACITY: Record<string, string> = {
  "0": "opacity-0", "0.05": "opacity-5", "0.1": "opacity-10",
  "0.2": "opacity-20", "0.25": "opacity-25", "0.3": "opacity-30",
  "0.4": "opacity-40", "0.5": "opacity-50", "0.6": "opacity-60",
  "0.7": "opacity-70", "0.75": "opacity-75", "0.8": "opacity-80",
  "0.9": "opacity-90", "0.95": "opacity-95", "1": "opacity-100",
};

// Tailwind default color palette (hex → name)
const COLOR_MAP: Record<string, string> = {
  "#000000": "black", "#FFFFFF": "white",
  "#F9FAFB": "gray-50", "#F3F4F6": "gray-100", "#E5E7EB": "gray-200",
  "#D1D5DB": "gray-300", "#9CA3AF": "gray-400", "#6B7280": "gray-500",
  "#4B5563": "gray-600", "#374151": "gray-700", "#1F2937": "gray-800",
  "#111827": "gray-900",
  "#FEF2F2": "red-50", "#FEE2E2": "red-100", "#FECACA": "red-200",
  "#FCA5A5": "red-300", "#F87171": "red-400", "#EF4444": "red-500",
  "#DC2626": "red-600", "#B91C1C": "red-700", "#991B1B": "red-800",
  "#7F1D1D": "red-900",
  "#FFF7ED": "orange-50", "#FFEDD5": "orange-100", "#FED7AA": "orange-200",
  "#FDBA74": "orange-300", "#FB923C": "orange-400", "#F97316": "orange-500",
  "#EA580C": "orange-600", "#C2410C": "orange-700",
  "#FFFBEB": "amber-50", "#FEF3C7": "amber-100", "#FDE68A": "amber-200",
  "#FCD34D": "amber-300", "#FBBF24": "amber-400", "#F59E0B": "amber-500",
  "#D97706": "amber-600", "#B45309": "amber-700",
  "#FEFCE8": "yellow-50", "#FEF9C3": "yellow-100", "#FDE047": "yellow-300",
  "#FACC15": "yellow-400", "#EAB308": "yellow-500",
  "#F0FDF4": "green-50", "#DCFCE7": "green-100", "#BBF7D0": "green-200",
  "#86EFAC": "green-300", "#4ADE80": "green-400", "#22C55E": "green-500",
  "#16A34A": "green-600", "#15803D": "green-700",
  "#ECFDF5": "emerald-50", "#D1FAE5": "emerald-100", "#A7F3D0": "emerald-200",
  "#6EE7B7": "emerald-300", "#34D399": "emerald-400", "#10B981": "emerald-500",
  "#059669": "emerald-600", "#047857": "emerald-700",
  "#EFF6FF": "blue-50", "#DBEAFE": "blue-100", "#BFDBFE": "blue-200",
  "#93C5FD": "blue-300", "#60A5FA": "blue-400", "#3B82F6": "blue-500",
  "#2563EB": "blue-600", "#1D4ED8": "blue-700", "#1E40AF": "blue-800",
  "#1E3A8A": "blue-900",
  "#EEF2FF": "indigo-50", "#E0E7FF": "indigo-100", "#C7D2FE": "indigo-200",
  "#A5B4FC": "indigo-300", "#818CF8": "indigo-400", "#6366F1": "indigo-500",
  "#4F46E5": "indigo-600", "#4338CA": "indigo-700",
  "#F5F3FF": "violet-50", "#EDE9FE": "violet-100", "#DDD6FE": "violet-200",
  "#C4B5FD": "violet-300", "#A78BFA": "violet-400", "#8B5CF6": "violet-500",
  "#7C3AED": "violet-600", "#6D28D9": "violet-700",
  "#FAF5FF": "purple-50", "#F3E8FF": "purple-100", "#E9D5FF": "purple-200",
  "#D8B4FE": "purple-300", "#C084FC": "purple-400", "#A855F7": "purple-500",
  "#9333EA": "purple-600", "#7E22CE": "purple-700",
  "#FDF2F8": "pink-50", "#FCE7F3": "pink-100", "#FBCFE8": "pink-200",
  "#F9A8D4": "pink-300", "#F472B6": "pink-400", "#EC4899": "pink-500",
  "#DB2777": "pink-600", "#BE185D": "pink-700",
};

// Spacing scale: px → Tailwind unit
const SPACING: Record<string, string> = {
  "0px": "0", "1px": "px", "2px": "0.5", "4px": "1", "6px": "1.5",
  "8px": "2", "10px": "2.5", "12px": "3", "14px": "3.5", "16px": "4",
  "20px": "5", "24px": "6", "28px": "7", "32px": "8", "36px": "9",
  "40px": "10", "44px": "11", "48px": "12", "56px": "14", "64px": "16",
  "80px": "20", "96px": "24",
};

// Spacing property → Tailwind prefix
const SPACING_PREFIX: Record<string, string> = {
  "padding": "p", "padding-top": "pt", "padding-bottom": "pb",
  "padding-left": "pl", "padding-right": "pr",
  "margin": "m", "margin-top": "mt", "margin-bottom": "mb",
  "margin-left": "ml", "margin-right": "mr",
  "gap": "gap",
};

// Color property → Tailwind prefix
const COLOR_PREFIX: Record<string, string> = {
  "color": "text", "background-color": "bg", "border-color": "border",
};

// Size keywords
const WIDTH_MAP: Record<string, string> = {
  "100%": "w-full", "auto": "w-auto", "100vw": "w-screen",
  "min-content": "w-min", "max-content": "w-max", "fit-content": "w-fit",
};

const HEIGHT_MAP: Record<string, string> = {
  "100%": "h-full", "auto": "h-auto", "100vh": "h-screen",
  "min-content": "h-min", "max-content": "h-max", "fit-content": "h-fit",
};

const MIN_HEIGHT_MAP: Record<string, string> = {
  "100vh": "min-h-screen", "100%": "min-h-full", "0px": "min-h-0",
};

function normalizeHex(hex: string): string {
  return hex.toUpperCase();
}

function rgbToHex(rgb: string): string | null {
  const match = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!match) return null;
  const [, r, g, b] = match;
  return "#" + [r, g, b].map(c => parseInt(c).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function normalizeColor(value: string): string | null {
  if (value.startsWith("rgb(")) return rgbToHex(value);
  if (value.startsWith("#")) return normalizeHex(value);
  return null;
}

export function cssToTailwind(property: string, value: string): string | null {
  // Font size
  if (property === "font-size") return FONT_SIZE[value] ?? null;

  // Font weight
  if (property === "font-weight") return FONT_WEIGHT[value] ?? null;

  // Border radius
  if (property === "border-radius") return BORDER_RADIUS[value] ?? null;

  // Display
  if (property === "display") return DISPLAY[value] ?? null;

  // Layout
  if (property === "align-items") return ALIGN_ITEMS[value] ?? null;
  if (property === "justify-content") return JUSTIFY_CONTENT[value] ?? null;
  if (property === "flex-direction") return FLEX_DIRECTION[value] ?? null;

  // Opacity
  if (property === "opacity") return OPACITY[value] ?? null;

  // Width / Height
  if (property === "width") return WIDTH_MAP[value] ?? null;
  if (property === "height") return HEIGHT_MAP[value] ?? null;
  if (property === "min-height") return MIN_HEIGHT_MAP[value] ?? null;

  // Colors
  const colorPrefix = COLOR_PREFIX[property];
  if (colorPrefix) {
    const hex = normalizeColor(value);
    if (!hex) return null;
    const colorName = COLOR_MAP[hex];
    if (!colorName) return null;
    return `${colorPrefix}-${colorName}`;
  }

  // Spacing
  const spacingPrefix = SPACING_PREFIX[property];
  if (spacingPrefix) {
    const unit = SPACING[value];
    if (!unit) return null;
    return `${spacingPrefix}-${unit}`;
  }

  return null;
}
