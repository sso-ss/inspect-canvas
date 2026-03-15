/**
 * inspect-canvas — Types
 */

export interface InspectData {
  /** HTML tag name */
  tag: string;
  /** Visible text content (truncated) */
  text?: string;
  /** CSS selector path to the element */
  selector: string;
  /** Key computed styles */
  styles: Record<string, string>;
  /** Hover-state style deltas (only properties that differ from default) */
  hoverStyles?: Record<string, string>;
  /** Rendered dimensions */
  size: { width: number; height: number };
  /** Position relative to viewport */
  position: { x: number; y: number };
  /** data-source attribute if present (e.g. "src/Hero.tsx:14") */
  source?: string;
  /** ISO timestamp of when element was selected */
  timestamp: string;
  /** User instruction for AI (e.g. "make this red") */
  instruction?: string;
}

export interface InspectServerOptions {
  /** URL to proxy and inspect (e.g. http://localhost:5173) */
  url?: string;
  /** Local folder to serve directly (e.g. ./my-project) */
  localDir?: string;
  /** Specific file within localDir to open (e.g. "about.html") */
  localFile?: string;
  /** Server port (default: 3100) */
  port?: number;
  /** Path to write .inspect-canvas.json (default: cwd) */
  outputDir?: string;
  /** Open browser automatically (default: true) */
  openBrowser?: boolean;
}
