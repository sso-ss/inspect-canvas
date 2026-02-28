/**
 * figma-html-import — Types
 *
 * Shared type definitions for the HTML→Figma pipeline.
 */

// ─── Figma Command Types ────────────────────────────────────────────────────

export interface FigmaColor {
  r: number; // 0–1
  g: number;
  b: number;
  a?: number;
}

export interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: FigmaColor;
  offset: { x: number; y: number };
  radius: number;
  spread?: number;
  visible?: boolean;
}

export interface FigmaCommand {
  command: string;
  params: Record<string, any>;
}

/** A batch of Figma commands to execute atomically */
export interface FigmaBatch {
  operations: FigmaCommand[];
}

// ─── Parsed DOM Types ───────────────────────────────────────────────────────

export interface ParsedNode {
  type: "element" | "text" | "root";
  tag?: string;
  attributes?: Record<string, string>;
  /** Raw inline style string */
  inlineStyle?: string;
  /** Class names */
  classList?: string[];
  /** ID attribute */
  id?: string;
  /** Text content (for text nodes) */
  text?: string;
  /** Child nodes */
  children: ParsedNode[];
}

// ─── Resolved Styles ────────────────────────────────────────────────────────

export interface ResolvedStyles {
  // Layout
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  flexWrap?: string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;

  // Sizing
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;

  // Spacing
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  // Visual
  backgroundColor?: FigmaColor;
  opacity?: number;
  overflow?: string;
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomRightRadius?: number;
  borderBottomLeftRadius?: number;

  // Border
  borderWidth?: number;
  borderColor?: FigmaColor;
  borderStyle?: string;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  textAlign?: string;
  textTransform?: string;
  textDecoration?: string;
  fontStyle?: string;
  color?: FigmaColor;

  // Effects
  boxShadow?: string;
  backgroundImage?: string;

  // Positioning (best-effort)
  position?: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  zIndex?: number;

  // Flex item properties
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: string;

  // Visibility
  visibility?: string;
}

// ─── Mapper Output ──────────────────────────────────────────────────────────

export type FigmaNodeType = "frame" | "text" | "rectangle" | "ellipse" | "line";

export interface FigmaNodeSpec {
  type: FigmaNodeType;
  name: string;
  params: Record<string, any>;
  children: FigmaNodeSpec[];
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface HtmlToFigmaOptions {
  /** WebSocket port for plugin bridge (default: 3055) */
  wsPort?: number;
  /** Parent node ID to insert into */
  parentId?: string;
  /** Default font family (default: "Inter") */
  baseFont?: string;
  /** Root font size for rem conversion (default: 16) */
  baseFontSize?: number;
  /** Scale factor (default: 1) */
  scale?: number;
  /** Additional CSS to apply */
  styles?: string;
  /** CSS selector to extract a specific element */
  selector?: string;
}
