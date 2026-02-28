/**
 * figma-html-import — Public API
 *
 * Main entry point for the library.
 *
 * Usage:
 *   import { htmlToFigma, htmlToCommands } from 'figma-html-import';
 *
 *   // Generate Figma commands (no side effects)
 *   const commands = htmlToCommands('<div style="padding:16px">Hello</div>');
 *
 *   // Parse, convert, and send to Figma via plugin bridge
 *   await htmlToFigma('<div>...</div>', { wsPort: 3055 });
 */

import { parseHtml } from "./parser.js";
import { mapToFigmaCommands } from "./mapper.js";
import { sendBatch, pingBridge } from "./bridge-client.js";
import type { FigmaCommand, HtmlToFigmaOptions } from "./types.js";

// Re-export types
export type {
  FigmaCommand,
  FigmaColor,
  FigmaEffect,
  FigmaBatch,
  FigmaNodeSpec,
  FigmaNodeType,
  ParsedNode,
  ResolvedStyles,
  HtmlToFigmaOptions,
} from "./types.js";

export type { BridgeResult, BridgeOptions } from "./bridge-client.js";

/**
 * Convert HTML/CSS to Figma commands without sending them.
 *
 * @param html - HTML string to convert
 * @param options - Conversion options
 * @returns Array of Figma plugin commands ready for batch execution
 *
 * @example
 * ```ts
 * const commands = htmlToCommands(`
 *   <div style="display:flex; gap:16px; padding:24px">
 *     <h1>Hello</h1>
 *     <p>World</p>
 *   </div>
 * `);
 * ```
 */
export function htmlToCommands(
  html: string,
  options: HtmlToFigmaOptions = {}
): FigmaCommand[] {
  const { root, styleBlocks } = parseHtml(html);

  const commands = mapToFigmaCommands(root, styleBlocks, {
    baseFont: options.baseFont || "Inter",
    baseFontSize: options.baseFontSize || 16,
    scale: options.scale || 1,
    parentId: options.parentId,
    styles: options.styles,
  });

  return commands;
}

/**
 * Convert HTML/CSS to Figma commands and send to the plugin bridge.
 *
 * @param html - HTML string to convert
 * @param options - Conversion and bridge options
 * @returns Bridge execution result
 *
 * @example
 * ```ts
 * const result = await htmlToFigma(`
 *   <button style="background:#3B82F6; color:white; padding:8px 16px; border-radius:8px">
 *     Click me
 *   </button>
 * `, { wsPort: 3055 });
 *
 * console.log(`Created ${result.succeeded} nodes`);
 * ```
 */
export async function htmlToFigma(
  html: string,
  options: HtmlToFigmaOptions = {}
): Promise<{
  success: boolean;
  commandCount: number;
  total?: number;
  succeeded?: number;
  failed?: number;
  error?: string;
}> {
  const commands = htmlToCommands(html, options);

  if (commands.length === 0) {
    return {
      success: true,
      commandCount: 0,
      total: 0,
      succeeded: 0,
      failed: 0,
    };
  }

  // If parentId is provided and commands reference $ref, inject parentId into root command
  if (options.parentId && commands.length > 0 && !commands[0].params.parentId) {
    commands[0].params.parentId = options.parentId;
  }

  try {
    const result = await sendBatch(commands, {
      port: options.wsPort || 18211,
      timeout: 15000,
    });

    return {
      success: result.success,
      commandCount: commands.length,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      error: result.error,
    };
  } catch (err: any) {
    return {
      success: false,
      commandCount: commands.length,
      error: err.message,
    };
  }
}

/**
 * Check if the Figma plugin bridge is reachable.
 */
export async function isBridgeReady(port: number = 18211): Promise<boolean> {
  return pingBridge(port);
}

// Re-export utilities for advanced usage
export { parseHtml } from "./parser.js";
export { mapToFigmaCommands } from "./mapper.js";
export { sendBatch, pingBridge } from "./bridge-client.js";
export { parseColor } from "./color-utils.js";
export { parseLengthToPx, parseShorthand, parseFontWeight, parseBoxShadow } from "./unit-utils.js";
