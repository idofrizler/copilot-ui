/**
 * MCP Streamable HTTP Server (SDK-backed, minimal)
 *
 * Delegates all HTTP/JSON-RPC/SSE semantics to the official MCP SDK transports.
 * Only responsibilities here:
 *  - auto-register existing ipcMain handlers as MCP tools
 *  - create a Node HTTP server that hands requests to the SDK transport
 *
 * This file intentionally keeps logic minimal and defers error handling to the SDK.
 */

import http from 'http';
import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'crypto';

// Minimal polyfills for File/Blob to satisfy undici in the Electron main process
// undici's webidl modules expect globals like File/Blob; Electron main (Node) lacks them.
if (typeof (globalThis as any).File === 'undefined') {
  (globalThis as any).File = class File {};
}
if (typeof (globalThis as any).Blob === 'undefined') {
  (globalThis as any).Blob = class Blob {
    constructor() {}
  };
}

const ipcHandlers = new Map<string, (event: IpcMainInvokeEvent, ...args: any[]) => any>();
let isWrapped = false;

export function wrapIpcMain(): void {
  if (isWrapped) return;
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => any
  ) => {
    ipcHandlers.set(channel, listener);
    return originalHandle(channel, listener);
  };
  isWrapped = true;
  console.log('[MCP] IPC handlers will be auto-registered for HTTP exposure');
}

const callTool = async (toolName: string, args: any) => {
  const handler = ipcHandlers.get(toolName);
  if (!handler) throw new Error(`Tool not found: ${toolName}`);
  const fakeEvent = {} as IpcMainInvokeEvent;
  return handler(fakeEvent, args);
};

export async function startMCPServer(port = 3000): Promise<void> {
  try {
    // Use FastMCP to drastically simplify server setup; dynamic import for ESM
    const { FastMCP } = (await import('fastmcp')) as any;
    const z = (await import('zod')) as any;

    const server = new FastMCP({
      name: 'cooper',
      version: process.env.npm_package_version || 'dev',
    });

    // Auto-register ipc handlers as tools
    const anySchema = z.any().optional();
    for (const channel of ipcHandlers.keys()) {
      server.addTool({
        name: channel,
        description: `Invokes IPC handler ${channel}`,
        parameters: anySchema,
        execute: async (args: any, ctx: any) => {
          const result = await callTool(channel, args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      });
    }

    // Start FastMCP with HTTP streaming transport on /mcp
    await server.start({ transportType: 'httpStream', httpStream: { port, endpoint: '/mcp' } });
    console.log(`[MCP] FastMCP Streamable HTTP listening on http://localhost:${port}/mcp`);
  } catch (err: any) {
    console.error('[MCP] Failed to start FastMCP:', err);
    console.error('[MCP] Install fastmcp and zod to enable this mode');
  }
}
