/**
 * figma-html-import — Bridge Client
 *
 * WebSocket client for the figma-unified-mcp relay server.
 * Connects to the MCP WebSocket server, joins a channel,
 * and sends batch commands that get relayed to the Figma plugin.
 *
 * Protocol:
 *   1. Connect to ws://localhost:{port}
 *   2. Join channel: { type: "join", channel: "figma" }
 *   3. Wait for join_ack
 *   4. Send command: { type: "message", channel, message: { id, command, params } }
 *   5. Receive response: { type: "message", message: { id, result } }
 */

import WebSocket from "ws";
import type { FigmaCommand } from "./types.js";

export interface BridgeOptions {
  /** MCP WebSocket relay server port (default: 18211) */
  port?: number;
  /** Connection timeout in ms (default: 10000) */
  timeout?: number;
  /** Channel name to join (default: "figma") */
  channel?: string;
}

export interface BridgeResult {
  success: boolean;
  total?: number;
  succeeded?: number;
  failed?: number;
  results?: any[];
  error?: string;
}

/**
 * Send a batch of Figma commands via the MCP relay server.
 */
export async function sendBatch(
  commands: FigmaCommand[],
  options: BridgeOptions = {}
): Promise<BridgeResult> {
  const port = options.port || 18211;
  const timeout = options.timeout || 10000;
  const channel = options.channel || "figma";
  const url = `ws://localhost:${port}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let timer: ReturnType<typeof setTimeout>;
    let joined = false;

    const commandId = `html-import-${Date.now()}`;

    timer = setTimeout(() => {
      ws.close();
      reject(new Error(
        `Connection to MCP relay timed out (${timeout}ms). ` +
        `Is the figma-unified-mcp server running and the Figma plugin connected?`
      ));
    }, timeout);

    ws.on("open", () => {
      // Step 1: Join the channel
      ws.send(JSON.stringify({ type: "join", channel }));
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const json = JSON.parse(data.toString());

        // Ignore system messages and pings
        if (json.type === "system") return;
        if (json.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        // Step 2: Wait for join_ack, then send the batch command
        if (json.type === "join_ack" && !joined) {
          joined = true;

          // Check if the plugin is connected (otherClients > 0)
          if (json.otherClients === 0) {
            clearTimeout(timer);
            ws.close();
            resolve({
              success: false,
              error: "No Figma plugin connected on the channel. " +
                "Make sure the Figma plugin is running and connected.",
            });
            return;
          }

          // Step 3: Send the batch_create command via relay
          const message = JSON.stringify({
            type: "message",
            channel,
            message: {
              id: commandId,
              command: "batch_create",
              params: { operations: commands },
            },
          });
          ws.send(message);
          return;
        }

        // Step 4: Handle the response from the plugin (relayed back to us)
        // Response format: { type: "message", message: { id, result } }
        const responseMsg = json.message || json;
        if (responseMsg.id === commandId) {
          clearTimeout(timer);
          ws.close();

          if (responseMsg.error) {
            resolve({
              success: false,
              error: responseMsg.error,
            });
          } else {
            const result = responseMsg.result || {};
            resolve({
              success: true,
              total: result.total,
              succeeded: result.succeeded,
              failed: result.failed,
              results: result.results,
            });
          }
          return;
        }
      } catch (err) {
        // Non-JSON message or parse error — ignore
      }
    });

    ws.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(new Error(
        `Cannot connect to MCP relay server at ${url}. ` +
        `Make sure figma-unified-mcp is running.\n` +
        `Error: ${err.message}`
      ));
    });

    ws.on("close", () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Check if the MCP relay server is reachable and a plugin is connected.
 */
export async function pingBridge(port: number = 18211): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 3000);

    ws.on("open", () => {
      // Join channel and check for plugin
      ws.send(JSON.stringify({ type: "join", channel: "figma" }));
    });

    ws.on("message", (data: WebSocket.Data) => {
      try {
        const json = JSON.parse(data.toString());
        if (json.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (json.type === "join_ack") {
          clearTimeout(timer);
          ws.close();
          // Plugin is connected if there are other clients on the channel
          resolve((json.otherClients || 0) > 0);
        }
      } catch {
        // ignore
      }
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
