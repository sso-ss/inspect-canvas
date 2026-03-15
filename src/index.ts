/**
 * inspect-canvas — Public API
 *
 * Usage:
 *   import { startInspectServer } from 'inspect-canvas';
 *   await startInspectServer({ url: 'http://localhost:5173' });
 */

export { startInspectServer } from "./preview-server.js";
export type { InspectData, InspectServerOptions } from "./types.js";
