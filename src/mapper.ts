/**
 * figma-html-import — Figma Mapper
 *
 * Converts parsed HTML nodes with resolved styles into Figma commands.
 * Produces a FigmaCommand[] array ready for the batch endpoint.
 *
 * Maps:
 *   - Block elements (div, section, etc.) → create_frame with auto-layout
 *   - Text elements (p, h1–h6, span, etc.) → create_text
 *   - Images → create_rectangle (placeholder with image dimensions)
 *   - Buttons / Inputs → create_frame + create_text children
 *   - Lists (ul/ol) → create_frame with list items
 *   - hr → create_rectangle (1px separator)
 *   - display:none → skip
 *   - visibility:hidden → create but set visible:false
 */

import type {
  ParsedNode,
  ResolvedStyles,
  FigmaCommand,
  FigmaColor,
  FigmaEffect,
  HtmlToFigmaOptions,
} from "./types.js";
import {
  resolveNodeStyles,
  parseStyleBlocks,
  resolveCustomProperties,
} from "./css-resolver.js";
import { getTextContent, isBlockElement, isInlineElement } from "./parser.js";
import { parseBoxShadow } from "./unit-utils.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const BLOCK_CONTAINER_TAGS = new Set([
  "div", "section", "article", "nav", "header", "footer", "main",
  "aside", "figure", "figcaption", "details", "summary", "dialog",
  "form", "fieldset",
]);

const TEXT_BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "label", "blockquote",
  "pre", "code", "address", "dd", "dt",
]);

const INLINE_TEXT_TAGS = new Set([
  "span", "a", "strong", "b", "em", "i", "u", "s", "small",
  "sub", "sup", "mark", "abbr", "cite", "q", "time", "var",
  "kbd", "samp",
]);

const LIST_TAGS = new Set(["ul", "ol"]);

// ─── Types ──────────────────────────────────────────────────────────────────

interface MapContext {
  options: Required<Pick<HtmlToFigmaOptions, "baseFont" | "baseFontSize" | "scale">> & HtmlToFigmaOptions;
  styleRules: ReturnType<typeof parseStyleBlocks>;
  commandIndex: number; // current index in the commands array for $ref tracking
}

interface MapResult {
  /** Commands generated for this node and its descendants */
  commands: FigmaCommand[];
  /** The index of the "root" command for this node (for $ref from parent) */
  rootIndex: number;
}

// ─── Justify/Align Mapping ──────────────────────────────────────────────────

function mapJustifyContent(val?: string): string | undefined {
  switch (val) {
    case "flex-start":
    case "start":
      return "MIN";
    case "flex-end":
    case "end":
      return "MAX";
    case "center":
      return "CENTER";
    case "space-between":
      return "SPACE_BETWEEN";
    default:
      return undefined;
  }
}

function mapAlignItems(val?: string): string | undefined {
  switch (val) {
    case "flex-start":
    case "start":
      return "MIN";
    case "flex-end":
    case "end":
      return "MAX";
    case "center":
      return "CENTER";
    case "stretch":
      return "MIN"; // Figma default for stretch-like
    case "baseline":
      return "MIN"; // Best approximation
    default:
      return undefined;
  }
}

function mapTextAlign(val?: string): string | undefined {
  switch (val) {
    case "left":
    case "start":
      return "LEFT";
    case "right":
    case "end":
      return "RIGHT";
    case "center":
      return "CENTER";
    case "justify":
      return "JUSTIFIED";
    default:
      return undefined;
  }
}

function mapTextDecoration(val?: string): string | undefined {
  switch (val) {
    case "underline":
      return "UNDERLINE";
    case "line-through":
      return "STRIKETHROUGH";
    default:
      return undefined;
  }
}

function mapTextTransform(val?: string): string | undefined {
  switch (val) {
    case "uppercase":
      return "UPPER";
    case "lowercase":
      return "LOWER";
    case "capitalize":
      return "TITLE";
    default:
      return undefined;
  }
}

// ─── Auto Layout Params Builder ─────────────────────────────────────────────

function buildAutoLayoutParams(styles: ResolvedStyles): Record<string, any> {
  const params: Record<string, any> = {};

  // Determine layout direction
  const display = styles.display || "";
  const isFlexRow = display === "flex" && styles.flexDirection !== "column";
  const isFlexColumn = display === "flex" && styles.flexDirection === "column";
  const isInlineFlex = display === "inline-flex";

  if (isFlexRow || isInlineFlex) {
    params.autoLayout = "HORIZONTAL";
  } else {
    // Default for block elements
    params.autoLayout = "VERTICAL";
  }

  // Item spacing (gap)
  if (params.autoLayout === "HORIZONTAL" && styles.columnGap !== undefined) {
    params.itemSpacing = styles.columnGap;
  } else if (params.autoLayout === "VERTICAL" && styles.rowGap !== undefined) {
    params.itemSpacing = styles.rowGap;
  } else if (styles.gap !== undefined) {
    params.itemSpacing = styles.gap;
  }

  // Counter-axis spacing
  if (params.autoLayout === "HORIZONTAL" && styles.rowGap !== undefined) {
    params.counterAxisSpacing = styles.rowGap;
  } else if (params.autoLayout === "VERTICAL" && styles.columnGap !== undefined) {
    params.counterAxisSpacing = styles.columnGap;
  }

  // Alignment
  const pAlign = mapJustifyContent(styles.justifyContent);
  if (pAlign) params.primaryAxisAlign = pAlign;
  const cAlign = mapAlignItems(styles.alignItems);
  if (cAlign) params.counterAxisAlign = cAlign;

  // Wrap
  if (styles.flexWrap === "wrap" || styles.flexWrap === "wrap-reverse") {
    params.layoutWrap = "WRAP";
  }

  // Padding
  if (styles.paddingTop !== undefined) params.paddingTop = styles.paddingTop;
  if (styles.paddingRight !== undefined) params.paddingRight = styles.paddingRight;
  if (styles.paddingBottom !== undefined) params.paddingBottom = styles.paddingBottom;
  if (styles.paddingLeft !== undefined) params.paddingLeft = styles.paddingLeft;

  // Sizing
  const width = styles.width;
  const height = styles.height;

  if (width === "100%" || width === "fill") {
    // Child should fill parent's cross/primary axis
    params.layoutSizingHorizontal = "FILL";
  } else if (typeof width === "number") {
    params.width = width;
    params.layoutSizingHorizontal = "FIXED";
    if (params.autoLayout === "HORIZONTAL") {
      params.primaryAxisSizing = "FIXED";
    } else {
      params.counterAxisSizing = "FIXED";
    }
  }

  if (height === "100%" || height === "fill") {
    params.layoutSizingVertical = "FILL";
  } else if (typeof height === "number") {
    params.height = height;
    params.layoutSizingVertical = "FIXED";
    if (params.autoLayout === "VERTICAL") {
      params.primaryAxisSizing = "FIXED";
    } else {
      params.counterAxisSizing = "FIXED";
    }
  }

  // flex-grow: 1+ means the item should stretch to fill available space
  if (styles.flexGrow && styles.flexGrow >= 1) {
    // Fill along the parent's primary axis — always overrides FIXED
    params.layoutSizingHorizontal = "FILL";
  }

  return params;
}

// ─── Fill / Stroke / Effects ────────────────────────────────────────────────

function buildFillParams(styles: ResolvedStyles): Record<string, any> {
  const params: Record<string, any> = {};

  if (styles.backgroundColor) {
    params.fillColor = styles.backgroundColor;
  } else {
    // Explicitly set transparent fill — Figma defaults new frames to white
    params.fillColor = { r: 0, g: 0, b: 0, a: 0 };
  }

  return params;
}

function buildStrokeParams(styles: ResolvedStyles): FigmaCommand | null {
  if (!styles.borderWidth || styles.borderWidth === 0) return null;
  if (styles.borderStyle === "none" || styles.borderStyle === "hidden") return null;

  const color = styles.borderColor || { r: 0, g: 0, b: 0, a: 1 };
  return {
    command: "set_stroke",
    params: {
      nodeId: "", // Will be filled with $ref
      color,
      weight: styles.borderWidth,
    },
  };
}

function buildCornerRadiusParams(styles: ResolvedStyles): Record<string, any> {
  const params: Record<string, any> = {};

  const hasPer =
    styles.borderTopLeftRadius !== undefined ||
    styles.borderTopRightRadius !== undefined ||
    styles.borderBottomRightRadius !== undefined ||
    styles.borderBottomLeftRadius !== undefined;

  // Per-corner values take priority over shorthand (inline per-corner should
  // override default shorthand `borderRadius` from css-defaults).
  if (hasPer) {
    const tl = styles.borderTopLeftRadius ?? styles.borderRadius ?? 0;
    const tr = styles.borderTopRightRadius ?? styles.borderRadius ?? 0;
    const br = styles.borderBottomRightRadius ?? styles.borderRadius ?? 0;
    const bl = styles.borderBottomLeftRadius ?? styles.borderRadius ?? 0;

    if (tl === tr && tr === br && br === bl) {
      params.cornerRadius = tl;
    } else {
      params.topLeftRadius = tl;
      params.topRightRadius = tr;
      params.bottomRightRadius = br;
      params.bottomLeftRadius = bl;
    }
  } else if (styles.borderRadius !== undefined) {
    params.cornerRadius = styles.borderRadius;
  }

  return params;
}

function buildEffects(styles: ResolvedStyles): FigmaEffect[] {
  const effects: FigmaEffect[] = [];

  if (styles.boxShadow && styles.boxShadow !== "none") {
    const shadows = parseBoxShadow(styles.boxShadow);
    for (const shadow of shadows) {
      effects.push({
        type: shadow.type,
        color: shadow.color,
        offset: { x: shadow.offsetX, y: shadow.offsetY },
        radius: shadow.blur,
        spread: shadow.spread,
        visible: true,
      });
    }
  }

  return effects;
}

// ─── Text Content Extraction ────────────────────────────────────────────────

/**
 * Collect text from a node and its inline children,
 * respecting inline elements like <strong>, <em>, <span>.
 */
function collectTextContent(node: ParsedNode): string {
  if (node.type === "text") return node.text || "";

  let text = "";
  for (const child of node.children) {
    if (child.type === "text") {
      text += child.text || "";
    } else if (child.type === "element" && INLINE_TEXT_TAGS.has(child.tag || "")) {
      text += collectTextContent(child);
    }
  }
  return text;
}

/**
 * Determine an appropriate name for a Figma node based on tag/id/class.
 */
function nodeName(node: ParsedNode): string {
  if (node.id) return `#${node.id}`;
  if (node.classList && node.classList.length > 0) return `.${node.classList[0]}`;
  return node.tag || "node";
}

// ─── Text Transform Helper ──────────────────────────────────────────────────

/**
 * Apply CSS text-transform to text content.
 */
function applyTextTransform(text: string, transform?: string): string {
  if (!transform || transform === 'none') return text;
  switch (transform) {
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'capitalize': return text.replace(/\b\w/g, c => c.toUpperCase());
    default: return text;
  }
}

// ─── Main Mapper ────────────────────────────────────────────────────────────

/**
 * Map a single ParsedNode (with its resolved styles) into Figma commands.
 * Returns commands and the root command index for $ref usage.
 */
function mapNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];

  // Skip display:none
  if (styles.display === "none") {
    return { commands: [], rootIndex: -1 };
  }

  const tag = node.tag || "";

  // ── Text-only nodes ─────────────────────────────────────────────────────
  if (node.type === "text") {
    const rawText = (node.text || "").trim();
    if (!rawText) return { commands: [], rootIndex: -1 };
    const text = applyTextTransform(rawText, styles.textTransform);

    const idx = ctx.commandIndex;
    const textParams: Record<string, any> = {
      content: text,
      name: text.slice(0, 30),
      fontFamily: styles.fontFamily || ctx.options.baseFont,
      fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
      fontWeight: styles.fontWeight || 400,
      textAutoResize: "WIDTH_AND_HEIGHT",
    };

    if (styles.color) textParams.fillColor = styles.color;
    if (styles.fontStyle === 'italic') textParams.italic = true;
    if (styles.lineHeight && typeof styles.lineHeight === "number") {
      textParams.lineHeight = styles.lineHeight * ctx.options.scale;
    }
    if (styles.letterSpacing !== undefined) {
      textParams.letterSpacing = styles.letterSpacing * ctx.options.scale;
    }
    const textAlignH = mapTextAlign(styles.textAlign);
    if (textAlignH) textParams.textAlignHorizontal = textAlignH;

    if (parentRefIndex !== undefined) {
      textParams.parentId = `$ref:${parentRefIndex}`;
    }

    commands.push({ command: "create_text", params: textParams });
    ctx.commandIndex++;
    return { commands, rootIndex: idx };
  }

  // ── <img> → rectangle with image fill ───────────────────────────────────
  if (tag === "img") {
    const idx = ctx.commandIndex;
    const width = node.attributes?.['data-width']
      ? parseInt(node.attributes['data-width'], 10) * ctx.options.scale
      : (node.attributes?.width
        ? parseInt(node.attributes.width, 10) * ctx.options.scale
        : (typeof styles.width === "number" ? styles.width * ctx.options.scale : 200));
    const height = node.attributes?.['data-height']
      ? parseInt(node.attributes['data-height'], 10) * ctx.options.scale
      : (node.attributes?.height
        ? parseInt(node.attributes.height, 10) * ctx.options.scale
        : (typeof styles.height === "number" ? styles.height * ctx.options.scale : 150));

    const imgSrc = node.attributes?.['data-src'] || node.attributes?.src || '';
    const altText = node.attributes?.alt || 'image';
    const imgName = imgSrc ? `img: ${altText} (${imgSrc.split('/').pop()?.split('?')[0] || 'url'})` : altText;

    const rectParams: Record<string, any> = {
      name: imgName.slice(0, 60),
      width,
      height,
      fillColor: { r: 0.85, g: 0.85, b: 0.85, a: 1 }, // Light gray placeholder
    };

    if (styles.borderRadius !== undefined) {
      rectParams.cornerRadius = styles.borderRadius * ctx.options.scale;
    }
    if (styles.opacity !== undefined) rectParams.opacity = styles.opacity;
    if (parentRefIndex !== undefined) rectParams.parentId = `$ref:${parentRefIndex}`;

    commands.push({ command: "create_rectangle", params: rectParams });
    ctx.commandIndex++;

    // If we have an image URL, add a set_image_fill command to load the real image
    if (imgSrc && imgSrc.startsWith('http')) {
      commands.push({
        command: "set_image_fill",
        params: {
          nodeId: `$ref:${idx}`,
          imageUrl: imgSrc,
          scaleMode: "FILL",
        },
      });
      ctx.commandIndex++;
    }

    // Post-creation stroke
    const strokeCmd = buildStrokeParams(styles);
    if (strokeCmd) {
      strokeCmd.params.nodeId = `$ref:${idx}`;
      commands.push(strokeCmd);
      ctx.commandIndex++;
    }

    return { commands, rootIndex: idx };
  }

  // ── <hr> → separator frame ────────────────────────────────────────────
  // Use create_frame (not create_rectangle) so that <hr> elements maintain
  // correct insertion order among sibling frames/text in auto-layout parents.
  if (tag === "hr") {
    const idx = ctx.commandIndex;
    const hrWidth = typeof styles.width === "number"
      ? styles.width * ctx.options.scale
      : 400 * ctx.options.scale;
    const hrParams: Record<string, any> = {
      name: "hr",
      width: hrWidth,
      height: 1 * ctx.options.scale,
      fillColor: styles.borderColor || styles.backgroundColor || { r: 0.8, g: 0.8, b: 0.8, a: 1 },
    };
    // flex-grow: hr with flex:1 should fill parent
    if (styles.flexGrow && styles.flexGrow >= 1) {
      hrParams.layoutSizingHorizontal = "FILL";
    }
    if (parentRefIndex !== undefined) hrParams.parentId = `$ref:${parentRefIndex}`;

    commands.push({ command: "create_frame", params: hrParams });
    ctx.commandIndex++;
    return { commands, rootIndex: idx };
  }

  // ── <br> → skip (handled via text node splitting) ───────────────────────
  if (tag === "br") {
    return { commands: [], rootIndex: -1 };
  }

  // ── <svg> → sized placeholder frame ─────────────────────────────────────
  if (tag === "svg") {
    const idx = ctx.commandIndex;
    const svgW = node.attributes?.['data-width']
      ? parseFloat(node.attributes['data-width']) * ctx.options.scale
      : (typeof styles.width === "number" ? styles.width * ctx.options.scale : 24 * ctx.options.scale);
    const svgH = node.attributes?.['data-height']
      ? parseFloat(node.attributes['data-height']) * ctx.options.scale
      : (typeof styles.height === "number" ? styles.height * ctx.options.scale : 24 * ctx.options.scale);

    const svgParams: Record<string, any> = {
      name: nodeName(node) || 'svg',
      width: svgW,
      height: svgH,
      fillColor: styles.backgroundColor || { r: 0.9, g: 0.9, b: 0.95, a: 1 }, // Light blue-gray placeholder
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "FIXED",
    };
    if (styles.opacity !== undefined) svgParams.opacity = styles.opacity;
    if (parentRefIndex !== undefined) svgParams.parentId = `$ref:${parentRefIndex}`;

    commands.push({ command: "create_frame", params: svgParams });
    ctx.commandIndex++;
    return { commands, rootIndex: idx };
  }

  // ── Text block elements (p, h1–h6, label, etc.) ────────────────────────
  if (TEXT_BLOCK_TAGS.has(tag)) {
    const rawText = collectTextContent(node).trim();
    if (!rawText) return { commands: [], rootIndex: -1 };

    // If the node has inline element children with their own styles (e.g. <a>, <span>),
    // treat it as a container frame so each child retains its own font/color/size
    const hasInlineElements = node.children.some(
      c => c.type === "element" && INLINE_TEXT_TAGS.has(c.tag || "")
    );
    if (hasInlineElements) {
      // Use container mapping to preserve per-child styles
      return mapContainerNode(node, styles, ctx, ancestors, parentRefIndex);
    }

    const text = applyTextTransform(rawText, styles.textTransform);
    const idx = ctx.commandIndex;
    const textParams: Record<string, any> = {
      content: text,
      name: `${tag}: ${text.slice(0, 25)}`,
      fontFamily: styles.fontFamily || ctx.options.baseFont,
      fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
      fontWeight: styles.fontWeight || 400,
    };

    if (styles.color) textParams.fillColor = styles.color;
    if (styles.fontStyle === 'italic') textParams.italic = true;
    if (styles.lineHeight && typeof styles.lineHeight === "number") {
      textParams.lineHeight = styles.lineHeight * ctx.options.scale;
    }
    if (styles.letterSpacing !== undefined) {
      textParams.letterSpacing = styles.letterSpacing * ctx.options.scale;
    }
    const textAlignH = mapTextAlign(styles.textAlign);
    if (textAlignH) textParams.textAlignHorizontal = textAlignH;
    if (styles.opacity !== undefined) textParams.opacity = styles.opacity;
    if (parentRefIndex !== undefined) textParams.parentId = `$ref:${parentRefIndex}`;

    // Set width from explicit style or parent for wrapping
    if (typeof styles.width === "number") {
      textParams.width = styles.width * ctx.options.scale;
      textParams.textAutoResize = "HEIGHT";
    } else {
      textParams.textAutoResize = "WIDTH_AND_HEIGHT";
    }

    commands.push({ command: "create_text", params: textParams });
    ctx.commandIndex++;
    return { commands, rootIndex: idx };
  }

  // ── Inline text elements (span, a, strong, etc.) → create_text ─────────
  if (INLINE_TEXT_TAGS.has(tag)) {
    const rawText = collectTextContent(node).trim();
    if (!rawText) return { commands: [], rootIndex: -1 };
    const text = applyTextTransform(rawText, styles.textTransform);

    const idx = ctx.commandIndex;
    const textParams: Record<string, any> = {
      content: text,
      name: `${tag}: ${text.slice(0, 25)}`,
      fontFamily: styles.fontFamily || ctx.options.baseFont,
      fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
      fontWeight: styles.fontWeight || 400,
      textAutoResize: "WIDTH_AND_HEIGHT",
    };

    if (styles.color) textParams.fillColor = styles.color;
    if (styles.fontStyle === 'italic') textParams.italic = true;
    if (styles.opacity !== undefined) textParams.opacity = styles.opacity;
    if (styles.lineHeight && typeof styles.lineHeight === "number") {
      textParams.lineHeight = styles.lineHeight * ctx.options.scale;
    }
    if (styles.letterSpacing !== undefined) {
      textParams.letterSpacing = styles.letterSpacing * ctx.options.scale;
    }

    const decoration = mapTextDecoration(styles.textDecoration);
    if (decoration) textParams.textDecoration = decoration;

    if (parentRefIndex !== undefined) textParams.parentId = `$ref:${parentRefIndex}`;

    commands.push({ command: "create_text", params: textParams });
    ctx.commandIndex++;
    return { commands, rootIndex: idx };
  }

  // ── <button> → frame with centered text ────────────────────────────────
  if (tag === "button") {
    return mapButtonNode(node, styles, ctx, ancestors, parentRefIndex);
  }

  // ── <input> / <textarea> / <select> → frame with text ──────────────────
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return mapInputNode(node, styles, ctx, ancestors, parentRefIndex);
  }

  // ── <ul> / <ol> → list container ────────────────────────────────────────
  if (LIST_TAGS.has(tag)) {
    return mapListNode(node, styles, ctx, ancestors, parentRefIndex);
  }

  // ── <li> → list item frame ─────────────────────────────────────────────
  if (tag === "li") {
    return mapListItemNode(node, styles, ctx, ancestors, parentRefIndex);
  }

  // ── <table> → nested frames (simplified) ────────────────────────────────
  if (tag === "table" || tag === "thead" || tag === "tbody" || tag === "tfoot") {
    return mapContainerNode(node, styles, ctx, ancestors, parentRefIndex);
  }
  if (tag === "tr") {
    // Row → horizontal frame
    const rowStyles = { ...styles, display: "flex", flexDirection: "row" };
    return mapContainerNode(node, rowStyles, ctx, ancestors, parentRefIndex);
  }
  if (tag === "td" || tag === "th") {
    // Cell: if only text, create text; otherwise container
    const text = collectTextContent(node).trim();
    if (text && node.children.every(c => c.type === "text" || INLINE_TEXT_TAGS.has(c.tag || ""))) {
      const idx = ctx.commandIndex;
      const textParams: Record<string, any> = {
        content: text,
        name: `${tag}: ${text.slice(0, 25)}`,
        fontFamily: styles.fontFamily || ctx.options.baseFont,
        fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
        fontWeight: tag === "th" ? (styles.fontWeight || 700) : (styles.fontWeight || 400),
        textAutoResize: "WIDTH_AND_HEIGHT",
      };
      if (styles.color) textParams.fillColor = styles.color;
      if (styles.lineHeight && typeof styles.lineHeight === "number") {
        textParams.lineHeight = styles.lineHeight * ctx.options.scale;
      }
      if (parentRefIndex !== undefined) textParams.parentId = `$ref:${parentRefIndex}`;
      commands.push({ command: "create_text", params: textParams });
      ctx.commandIndex++;
      return { commands, rootIndex: idx };
    }
    return mapContainerNode(node, styles, ctx, ancestors, parentRefIndex);
  }

  // ── Block container elements (div, section, etc.) → frame ──────────────
  return mapContainerNode(node, styles, ctx, ancestors, parentRefIndex);
}

/**
 * Map a container (block) element to a frame with auto-layout.
 * When a container has position:relative/absolute children, those children
 * are placed with x/y coordinates instead of auto-layout.
 */
function mapContainerNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];
  const frameIdx = ctx.commandIndex;

  // Pre-resolve child styles to check for absolute positioning
  const newAncestors = [node, ...ancestors];
  const resolvedChildren: { child: ParsedNode; styles: ResolvedStyles }[] = [];
  let hasAbsoluteChildren = false;
  let hasFlowChildren = false;

  for (const child of node.children) {
    if (child.type === "text") {
      const text = (child.text || "").trim();
      if (!text) continue;
      resolvedChildren.push({ child, styles: { ...styles } });
      hasFlowChildren = true;
    } else if (child.type === "element") {
      const childStyles = resolveNodeStyles(child, ctx.styleRules, newAncestors, {
        baseFontSize: ctx.options.baseFontSize,
        parentFontSize: styles.fontSize || ctx.options.baseFontSize,
      });
      if (childStyles.display === "none") continue;
      if (childStyles.position === "absolute" || childStyles.position === "fixed") {
        hasAbsoluteChildren = true;
      } else {
        hasFlowChildren = true;
      }
      resolvedChildren.push({ child, styles: childStyles });
    }
  }

  // If ALL children are absolute, skip auto-layout entirely
  const useAutoLayout = hasFlowChildren || !hasAbsoluteChildren;

  // The Figma plugin may reorder children by node type (frames before text),
  // breaking visual order when a container has mixed child types.
  // Detect this case so we can wrap text children in frames to keep order.
  let hasFrameProducingChildren = false;
  let hasTextProducingChildren = false;
  for (const { child } of resolvedChildren) {
    if (child.type === "text") {
      hasTextProducingChildren = true;
    } else if (child.type === "element") {
      const childTag = child.tag || "";
      // Inline text tags and text block tags both produce create_text commands.
      // <br> produces nothing and should not trigger wrapping.
      if (INLINE_TEXT_TAGS.has(childTag) || TEXT_BLOCK_TAGS.has(childTag)) {
        hasTextProducingChildren = true;
      } else if (childTag !== "br") {
        hasFrameProducingChildren = true;
      }
    }
  }
  const needsTextWrapping = hasFrameProducingChildren && hasTextProducingChildren;

  // Compute itemSpacing from child margins (best-effort).
  // CSS margins don't map perfectly to Figma's uniform itemSpacing,
  // so we use the most common non-zero margin-top as a reasonable approximation.
  let inferredItemSpacing: number | undefined;
  if (useAutoLayout) {
    const marginTops: number[] = [];
    for (const { styles: cs } of resolvedChildren) {
      if (cs.marginTop && cs.marginTop > 0) marginTops.push(cs.marginTop);
    }
    if (marginTops.length > 0) {
      // Use median margin-top for robustness
      marginTops.sort((a, b) => a - b);
      inferredItemSpacing = marginTops[Math.floor(marginTops.length / 2)];
    }
  }

  // Build frame params
  const fillParams = buildFillParams(styles);
  const cornerParams = buildCornerRadiusParams(styles);

  const frameParams: Record<string, any> = {
    name: nodeName(node),
    ...fillParams,
    ...cornerParams,
  };

  if (useAutoLayout) {
    const alParams = buildAutoLayoutParams(styles);
    Object.assign(frameParams, alParams);
  }

  // Sizing
  if (typeof styles.width === "number") frameParams.width = styles.width * ctx.options.scale;
  if (typeof styles.height === "number") frameParams.height = styles.height * ctx.options.scale;

  // Layout sizing: tell parent auto-layout to respect explicit dimensions
  if (frameParams.width !== undefined && !frameParams.layoutSizingHorizontal) {
    frameParams.layoutSizingHorizontal = "FIXED";
  }
  if (frameParams.height !== undefined && !frameParams.layoutSizingVertical) {
    frameParams.layoutSizingVertical = "FIXED";
  }

  // Scale padding
  if (frameParams.paddingTop !== undefined) frameParams.paddingTop *= ctx.options.scale;
  if (frameParams.paddingRight !== undefined) frameParams.paddingRight *= ctx.options.scale;
  if (frameParams.paddingBottom !== undefined) frameParams.paddingBottom *= ctx.options.scale;
  if (frameParams.paddingLeft !== undefined) frameParams.paddingLeft *= ctx.options.scale;
  if (frameParams.itemSpacing !== undefined) frameParams.itemSpacing *= ctx.options.scale;
  if (frameParams.counterAxisSpacing !== undefined) frameParams.counterAxisSpacing *= ctx.options.scale;

  // Apply inferred itemSpacing from child margins (only if not set from gap)
  if (inferredItemSpacing !== undefined && !frameParams.itemSpacing) {
    frameParams.itemSpacing = inferredItemSpacing * ctx.options.scale;
  }

  // Corner radius scaling & capping (cap huge values like 999px to half the min dimension)
  const capRadius = (r: number) => {
    const w = frameParams.width || 0;
    const h = frameParams.height || 0;
    if (w > 0 && h > 0) return Math.min(r, Math.min(w, h) / 2);
    return r;
  };
  if (frameParams.cornerRadius !== undefined) {
    frameParams.cornerRadius = capRadius(frameParams.cornerRadius * ctx.options.scale);
  }
  if (frameParams.topLeftRadius !== undefined) frameParams.topLeftRadius = capRadius(frameParams.topLeftRadius * ctx.options.scale);
  if (frameParams.topRightRadius !== undefined) frameParams.topRightRadius = capRadius(frameParams.topRightRadius * ctx.options.scale);
  if (frameParams.bottomRightRadius !== undefined) frameParams.bottomRightRadius = capRadius(frameParams.bottomRightRadius * ctx.options.scale);
  if (frameParams.bottomLeftRadius !== undefined) frameParams.bottomLeftRadius = capRadius(frameParams.bottomLeftRadius * ctx.options.scale);

  // Opacity
  if (styles.opacity !== undefined) frameParams.opacity = styles.opacity;

  // Clip content
  if (styles.overflow === "hidden" || styles.overflow === "clip" || styles.overflow === "scroll" || styles.overflow === "auto") {
    frameParams.clipsContent = true;
  }

  // Visibility
  if (styles.visibility === "hidden") {
    frameParams.visible = false;
  }

  // Parent ref
  if (parentRefIndex !== undefined) {
    frameParams.parentId = `$ref:${parentRefIndex}`;
  }

  commands.push({ command: "create_frame", params: frameParams });
  ctx.commandIndex++;

  // Post-creation commands (stroke, effects)
  const strokeCmd = buildStrokeParams(styles);
  if (strokeCmd) {
    strokeCmd.params.nodeId = `$ref:${frameIdx}`;
    commands.push(strokeCmd);
    ctx.commandIndex++;
  }

  const effects = buildEffects(styles);
  if (effects.length > 0) {
    commands.push({
      command: "set_effects",
      params: { nodeId: `$ref:${frameIdx}`, effects },
    });
    ctx.commandIndex++;
  }

  // Map children
  for (const { child, styles: childStyles } of resolvedChildren) {
    // When the container has mixed child types (frame + text), wrap text-producing
    // children in a transparent frame so the plugin preserves insertion order.
    const childTag = child.tag || "";
    const isTextProducing = child.type === "text" ||
      (child.type === "element" && (INLINE_TEXT_TAGS.has(childTag) || TEXT_BLOCK_TAGS.has(childTag)));

    if (isTextProducing && needsTextWrapping) {
      // Create a transparent wrapper frame
      const wrapperIdx = ctx.commandIndex;
      const wrapperName = child.type === "text"
        ? (child.text || "").trim().slice(0, 20) || "text"
        : child.tag || "text";
      commands.push({
        command: "create_frame",
        params: {
          name: wrapperName,
          fillColor: { r: 0, g: 0, b: 0, a: 0 },
          autoLayout: "HORIZONTAL",
          counterAxisAlign: "CENTER",
          parentId: `$ref:${frameIdx}`,
        },
      });
      ctx.commandIndex++;
      const childResult = mapNode(child, childStyles, ctx, newAncestors, wrapperIdx);
      commands.push(...childResult.commands);
    } else if (child.type === "text") {
      const childResult = mapNode(child, childStyles, ctx, newAncestors, frameIdx);
      commands.push(...childResult.commands);
    } else if (child.type === "element") {
      const isAbsolute = childStyles.position === "absolute" || childStyles.position === "fixed";

      const childResult = mapNode(child, childStyles, ctx, newAncestors, frameIdx);

      // For absolute-positioned children, set x/y from top/left
      if (isAbsolute && childResult.rootIndex >= 0) {
        const rootCmd = childResult.commands[0];
        if (rootCmd?.params) {
          if (childStyles.left !== undefined) rootCmd.params.x = childStyles.left * ctx.options.scale;
          else if (childStyles.right !== undefined && typeof styles.width === "number") {
            // Approximate: x = parent.width - child.width - right
            const cw = typeof childStyles.width === "number" ? childStyles.width : 0;
            rootCmd.params.x = (styles.width - cw - childStyles.right) * ctx.options.scale;
          }
          if (childStyles.top !== undefined) rootCmd.params.y = childStyles.top * ctx.options.scale;
          else if (childStyles.bottom !== undefined && typeof styles.height === "number") {
            const ch = typeof childStyles.height === "number" ? childStyles.height : 0;
            rootCmd.params.y = (styles.height - ch - childStyles.bottom) * ctx.options.scale;
          }
        }
      }

      commands.push(...childResult.commands);
    }
  }

  return { commands, rootIndex: frameIdx };
}

/**
 * Map a <button> to a frame with centered text.
 */
function mapButtonNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];
  const frameIdx = ctx.commandIndex;

  const text = collectTextContent(node).trim() || "Button";
  const cornerParams = buildCornerRadiusParams(styles);

  const frameParams: Record<string, any> = {
    name: nodeName(node) || "button",
    autoLayout: "HORIZONTAL",
    primaryAxisAlign: mapJustifyContent(styles.justifyContent) || "CENTER",
    counterAxisAlign: mapAlignItems(styles.alignItems) || "CENTER",
    ...buildFillParams(styles),
    ...cornerParams,
  };

  // Width/height sizing — must set both layoutSizing* AND primaryAxisSizing/counterAxisSizing
  // because the Figma plugin uses primaryAxisSizing/counterAxisSizing for auto-layout frames
  if (styles.width === "100%" || styles.width === "fill") {
    frameParams.layoutSizingHorizontal = "FILL";
    frameParams.primaryAxisSizing = "FILL";
  } else if (typeof styles.width === "number") {
    frameParams.width = styles.width * ctx.options.scale;
    frameParams.layoutSizingHorizontal = "FIXED";
    frameParams.primaryAxisSizing = "FIXED";
  }
  if (typeof styles.height === "number") {
    frameParams.height = styles.height * ctx.options.scale;
    frameParams.layoutSizingVertical = "FIXED";
    frameParams.counterAxisSizing = "FIXED";
  }

  // Scale padding
  if (styles.paddingTop !== undefined) frameParams.paddingTop = styles.paddingTop * ctx.options.scale;
  if (styles.paddingRight !== undefined) frameParams.paddingRight = styles.paddingRight * ctx.options.scale;
  if (styles.paddingBottom !== undefined) frameParams.paddingBottom = styles.paddingBottom * ctx.options.scale;
  if (styles.paddingLeft !== undefined) frameParams.paddingLeft = styles.paddingLeft * ctx.options.scale;

  // Corner radius: scale and cap for pill shapes
  if (frameParams.cornerRadius !== undefined) {
    let r = frameParams.cornerRadius * ctx.options.scale;
    const w = frameParams.width || 0;
    const h = frameParams.height || 0;
    if (w > 0 && h > 0) r = Math.min(r, Math.min(w, h) / 2);
    frameParams.cornerRadius = r;
  }
  if (styles.opacity !== undefined) frameParams.opacity = styles.opacity;
  if (parentRefIndex !== undefined) frameParams.parentId = `$ref:${parentRefIndex}`;

  commands.push({ command: "create_frame", params: frameParams });
  ctx.commandIndex++;

  // Stroke
  const strokeCmd = buildStrokeParams(styles);
  if (strokeCmd) {
    strokeCmd.params.nodeId = `$ref:${frameIdx}`;
    commands.push(strokeCmd);
    ctx.commandIndex++;
  }

  // Effects
  const effects = buildEffects(styles);
  if (effects.length > 0) {
    commands.push({
      command: "set_effects",
      params: { nodeId: `$ref:${frameIdx}`, effects },
    });
    ctx.commandIndex++;
  }

  // Text child
  const textIdx = ctx.commandIndex;
  const textParams: Record<string, any> = {
    content: text,
    name: text.slice(0, 30),
    parentId: `$ref:${frameIdx}`,
    fontFamily: styles.fontFamily || ctx.options.baseFont,
    fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
    fontWeight: styles.fontWeight || 400,
  };
  if (styles.color) textParams.fillColor = styles.color;

  commands.push({ command: "create_text", params: textParams });
  ctx.commandIndex++;

  return { commands, rootIndex: frameIdx };
}

/**
 * Map an <input> / <textarea> / <select> to a frame with placeholder/value text.
 */
function mapInputNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];
  const frameIdx = ctx.commandIndex;

  const placeholder = node.attributes?.placeholder || node.attributes?.value || "";
  const inputType = node.attributes?.type || "text";
  const cornerParams = buildCornerRadiusParams(styles);

  const frameParams: Record<string, any> = {
    name: nodeName(node) || `input[${inputType}]`,
    autoLayout: "HORIZONTAL",
    counterAxisAlign: "CENTER",
    ...buildFillParams(styles),
    ...cornerParams,
  };

  // Width/height sizing — must set both layoutSizing* AND primaryAxisSizing/counterAxisSizing
  // because the Figma plugin uses primaryAxisSizing/counterAxisSizing for auto-layout frames
  if (styles.width === "100%" || styles.width === "fill") {
    frameParams.layoutSizingHorizontal = "FILL";
    frameParams.primaryAxisSizing = "FILL";
  } else {
    frameParams.width = (typeof styles.width === "number" ? styles.width : 200) * ctx.options.scale;
    frameParams.layoutSizingHorizontal = "FIXED";
    frameParams.primaryAxisSizing = "FIXED";
  }
  frameParams.height = (typeof styles.height === "number" ? styles.height : 36) * ctx.options.scale;
  frameParams.layoutSizingVertical = "FIXED";
  frameParams.counterAxisSizing = "FIXED";

  if (styles.paddingTop !== undefined) frameParams.paddingTop = styles.paddingTop * ctx.options.scale;
  if (styles.paddingRight !== undefined) frameParams.paddingRight = styles.paddingRight * ctx.options.scale;
  if (styles.paddingBottom !== undefined) frameParams.paddingBottom = styles.paddingBottom * ctx.options.scale;
  if (styles.paddingLeft !== undefined) frameParams.paddingLeft = styles.paddingLeft * ctx.options.scale;
  // Cap border-radius for pill shapes
  if (frameParams.cornerRadius !== undefined) {
    let r = frameParams.cornerRadius * ctx.options.scale;
    const w = frameParams.width || 0;
    const h = frameParams.height || 0;
    if (w > 0 && h > 0) r = Math.min(r, Math.min(w, h) / 2);
    frameParams.cornerRadius = r;
  }
  if (styles.opacity !== undefined) frameParams.opacity = styles.opacity;
  if (parentRefIndex !== undefined) frameParams.parentId = `$ref:${parentRefIndex}`;

  commands.push({ command: "create_frame", params: frameParams });
  ctx.commandIndex++;

  // Stroke (inputs usually have borders)
  const strokeCmd = buildStrokeParams(styles);
  if (strokeCmd) {
    strokeCmd.params.nodeId = `$ref:${frameIdx}`;
    commands.push(strokeCmd);
    ctx.commandIndex++;
  }

  // Placeholder text
  if (placeholder) {
    const textParams: Record<string, any> = {
      content: placeholder,
      name: placeholder.slice(0, 30),
      parentId: `$ref:${frameIdx}`,
      fontFamily: styles.fontFamily || ctx.options.baseFont,
      fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
      fontWeight: styles.fontWeight || 400,
      fillColor: styles.color || { r: 0.6, g: 0.6, b: 0.6, a: 1 }, // Gray for placeholder
    };

    commands.push({ command: "create_text", params: textParams });
    ctx.commandIndex++;
  }

  return { commands, rootIndex: frameIdx };
}

/**
 * Map a <ul> / <ol> to a vertical frame with list-item children.
 */
function mapListNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];
  const frameIdx = ctx.commandIndex;

  const frameParams: Record<string, any> = {
    name: node.tag || "list",
    autoLayout: "VERTICAL",
    itemSpacing: (styles.gap ?? 4) * ctx.options.scale,
    ...buildFillParams(styles),
  };

  if (styles.paddingTop !== undefined) frameParams.paddingTop = styles.paddingTop * ctx.options.scale;
  if (styles.paddingRight !== undefined) frameParams.paddingRight = styles.paddingRight * ctx.options.scale;
  if (styles.paddingBottom !== undefined) frameParams.paddingBottom = styles.paddingBottom * ctx.options.scale;
  if (styles.paddingLeft !== undefined) frameParams.paddingLeft = styles.paddingLeft * ctx.options.scale;
  if (parentRefIndex !== undefined) frameParams.parentId = `$ref:${parentRefIndex}`;

  commands.push({ command: "create_frame", params: frameParams });
  ctx.commandIndex++;

  // Map children
  const newAncestors = [node, ...ancestors];
  let itemIndex = 0;
  for (const child of node.children) {
    if (child.type !== "element") continue;

    const childStyles = resolveNodeStyles(child, ctx.styleRules, newAncestors, {
      baseFontSize: ctx.options.baseFontSize,
      parentFontSize: styles.fontSize || ctx.options.baseFontSize,
    });

    if (childStyles.display === "none") continue;

    // Pass ordered list index for numbering
    if (child.tag === "li") {
      itemIndex++;
      (child as any)._listIndex = itemIndex;
      (child as any)._listType = node.tag;
    }

    const childResult = mapNode(child, childStyles, ctx, newAncestors, frameIdx);
    commands.push(...childResult.commands);
  }

  return { commands, rootIndex: frameIdx };
}

/**
 * Map a <li> to a horizontal frame with bullet/number + content.
 * Children are processed individually so each inline element (e.g. <a>)
 * retains its own styles (font-size, color, etc.).
 */
function mapListItemNode(
  node: ParsedNode,
  styles: ResolvedStyles,
  ctx: MapContext,
  ancestors: ParsedNode[],
  parentRefIndex?: number
): MapResult {
  const commands: FigmaCommand[] = [];
  const frameIdx = ctx.commandIndex;

  const listType = (node as any)._listType || "ul";
  const listIndex = (node as any)._listIndex || 1;
  const bullet = listType === "ol" ? `${listIndex}.` : "•";

  const frameParams: Record<string, any> = {
    name: `li`,
    autoLayout: "HORIZONTAL",
    itemSpacing: 8 * ctx.options.scale,
    counterAxisAlign: "MIN",
  };
  if (parentRefIndex !== undefined) frameParams.parentId = `$ref:${parentRefIndex}`;

  commands.push({ command: "create_frame", params: frameParams });
  ctx.commandIndex++;

  // Bullet / number text
  const bulletParams: Record<string, any> = {
    content: bullet,
    name: "bullet",
    parentId: `$ref:${frameIdx}`,
    fontFamily: styles.fontFamily || ctx.options.baseFont,
    fontSize: (styles.fontSize || ctx.options.baseFontSize) * ctx.options.scale,
    fontWeight: styles.fontWeight || 400,
    textAutoResize: "WIDTH_AND_HEIGHT",
  };
  if (styles.color) bulletParams.fillColor = styles.color;
  commands.push({ command: "create_text", params: bulletParams });
  ctx.commandIndex++;

  // Process children individually so each element retains its own styles
  const newAncestors = [node, ...ancestors];
  for (const child of node.children) {
    if (child.type === "text") {
      const text = (child.text || "").trim();
      if (!text) continue;
      // Text nodes inherit parent (li) styles
      const childResult = mapNode(child, styles, ctx, newAncestors, frameIdx);
      commands.push(...childResult.commands);
    } else if (child.type === "element") {
      const childStyles = resolveNodeStyles(child, ctx.styleRules, newAncestors, {
        baseFontSize: ctx.options.baseFontSize,
        parentFontSize: styles.fontSize || ctx.options.baseFontSize,
      });
      if (childStyles.display === "none") continue;
      const childResult = mapNode(child, childStyles, ctx, newAncestors, frameIdx);
      commands.push(...childResult.commands);
    }
  }

  return { commands, rootIndex: frameIdx };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface MapOptions {
  baseFont?: string;
  baseFontSize?: number;
  scale?: number;
  parentId?: string;
  styles?: string;
}

/**
 * Convert a parsed HTML tree + style blocks into Figma commands.
 */
export function mapToFigmaCommands(
  root: ParsedNode,
  styleBlocks: string[],
  options: MapOptions = {}
): FigmaCommand[] {
  const opts = {
    baseFont: options.baseFont || "Inter",
    baseFontSize: options.baseFontSize || 16,
    scale: options.scale || 1,
    ...options,
  };

  // Parse style blocks
  const allStyles = [...styleBlocks];
  if (options.styles) allStyles.push(options.styles);
  const styleRules = parseStyleBlocks(allStyles);

  const ctx: MapContext = {
    options: opts,
    styleRules,
    commandIndex: 0,
  };

  const resolveCtx = {
    baseFontSize: opts.baseFontSize,
    parentFontSize: opts.baseFontSize,
  };

  // If root has a single element child, use that as the root
  let effectiveRoot = root;
  if (root.type === "root" && root.children.length === 1 && root.children[0].type === "element") {
    effectiveRoot = root.children[0];
  }

  if (effectiveRoot.type === "root") {
    // No children → empty output
    if (effectiveRoot.children.length === 0) return [];

    // Multiple root children → wrap in a frame
    const wrapperStyles = resolveNodeStyles(effectiveRoot, styleRules, [], resolveCtx);
    const wrapperResult = mapContainerNode(effectiveRoot, wrapperStyles, ctx, [], undefined);
    return wrapperResult.commands;
  }

  // Single root element
  const rootStyles = resolveNodeStyles(effectiveRoot, styleRules, [], resolveCtx);
  const result = mapNode(effectiveRoot, rootStyles, ctx, [], undefined);
  return result.commands;
}
