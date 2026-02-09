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

import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { createRequire } from 'module';
import { dirname } from 'path';
import { pathToFileURL } from 'url';

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
let completionsPatched = false;
let registerIpcTool: ((channel: string) => void) | null = null;
const registeredTools = new Set<string>();

export function wrapIpcMain(): void {
  if (isWrapped) return;
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => any
  ) => {
    ipcHandlers.set(channel, listener);
    registerIpcTool?.(channel);
    return originalHandle(channel, listener);
  };
  isWrapped = true;
  console.log('[MCP] IPC handlers will be auto-registered for HTTP exposure');
}

const normalizeIpcArgs = (args: any): any[] => {
  if (args === undefined) return [];
  if (Array.isArray(args)) return args;
  if (args && typeof args === 'object' && Array.isArray((args as { args?: any }).args)) {
    return (args as { args?: any[] }).args ?? [];
  }
  return [args];
};

const callTool = async (toolName: string, args: any) => {
  const handler = ipcHandlers.get(toolName);
  if (!handler) throw new Error(`Tool not found: ${toolName}`);
  const fakeEvent = {} as IpcMainInvokeEvent;
  return handler(fakeEvent, ...normalizeIpcArgs(args));
};

const serverPatchFlag = Symbol('cooperMcpServerPatched');
const sessionPatchFlag = Symbol('cooperMcpSessionPatched');
const closingServers = new WeakSet<object>();
const closingTransports = new WeakSet<object>();

const patchServerCompletions = async (serverModule: { Server?: any }): Promise<void> => {
  const serverProto = serverModule?.Server?.prototype;
  if (!serverProto || (serverProto as any)[serverPatchFlag]) return;
  const originalAssert = serverProto?.assertRequestHandlerCapability;
  if (typeof originalAssert === 'function') {
    serverProto.assertRequestHandlerCapability = function (method: string) {
      if (method === 'completion/complete') return;
      return originalAssert.call(this, method);
    };
  }
  const originalClose = serverProto?.close;
  if (typeof originalClose === 'function') {
    serverProto.close = async function () {
      if (closingServers.has(this)) return;
      closingServers.add(this);
      const transport = this.transport;
      const originalOnClose = transport?.onclose;
      if (transport) {
        transport.onclose = undefined;
      }
      try {
        return await originalClose.call(this);
      } finally {
        if (transport) {
          transport.onclose = originalOnClose;
        }
        closingServers.delete(this);
      }
    };
  }
  (serverProto as any)[serverPatchFlag] = true;
};

const patchCompletionsCapability = async (): Promise<void> => {
  if (completionsPatched) return;
  const rootServer = (await import('@modelcontextprotocol/sdk/server/index.js')) as any;
  await patchServerCompletions(rootServer);
  try {
    const require = createRequire(import.meta.url);
    const fastMcpEntry = require.resolve('fastmcp');
    const fastMcpDir = dirname(fastMcpEntry);
    const nestedCandidates = [
      '@modelcontextprotocol/sdk/server/index.js',
      '@modelcontextprotocol/sdk/dist/esm/server/index.js',
    ];
    for (const candidate of nestedCandidates) {
      try {
        const nestedSdkPath = require.resolve(candidate, { paths: [fastMcpDir] });
        const nestedServer = (await import(pathToFileURL(nestedSdkPath).href)) as any;
        await patchServerCompletions(nestedServer);
      } catch {
        // Skip missing candidate.
      }
    }
    try {
      const cjsServer = require('@modelcontextprotocol/sdk/dist/cjs/server/index.js');
      await patchServerCompletions(cjsServer);
    } catch {
      // Skip if CJS build not present.
    }
  } catch {
    // Nested SDK may not exist; root patch is enough.
  }
  completionsPatched = true;
};

export async function startMCPServer(port = 3000): Promise<void> {
  try {
    // Use FastMCP to drastically simplify server setup; dynamic import for ESM
    await patchCompletionsCapability();
    const { FastMCP, FastMCPSession } = (await import('fastmcp')) as any;
    const { z } = (await import('zod/v3')) as any;

    if (typeof FastMCPSession?.prototype?.setupCompleteHandlers === 'function') {
      FastMCPSession.prototype.setupCompleteHandlers = function () {};
    }
    if (FastMCPSession?.prototype?.close) {
      const originalClose = FastMCPSession.prototype.close;
      FastMCPSession.prototype.close = async function () {
        const server = this.server;
        const transport = server?.transport;
        const originalOnClose = transport?.onclose;
        if (transport) {
          transport.onclose = undefined;
        }
        try {
          return await originalClose.call(this);
        } finally {
          if (transport) {
            transport.onclose = originalOnClose;
          }
        }
      };
    }
    if (
      FastMCPSession?.prototype?.connect &&
      !(FastMCPSession.prototype as any)[sessionPatchFlag]
    ) {
      const originalConnect = FastMCPSession.prototype.connect;
      FastMCPSession.prototype.connect = async function (transport: any) {
        if (transport?.close) {
          const originalClose = transport.close;
          transport.close = async (...args: any[]) => {
            if (closingTransports.has(transport)) return;
            closingTransports.add(transport);
            const originalOnClose = transport.onclose;
            transport.onclose = undefined;
            try {
              return await originalClose.apply(transport, args);
            } finally {
              transport.onclose = originalOnClose;
              closingTransports.delete(transport);
            }
          };
        }
        return originalConnect.call(this, transport);
      };
      (FastMCPSession.prototype as any)[sessionPatchFlag] = true;
    }

    const server = new FastMCP({
      name: 'cooper',
      version: process.env.npm_package_version || 'dev',
    });

    const anySchema = z.object({}).passthrough().optional();
    registerIpcTool = (channel: string) => {
      if (registeredTools.has(channel)) return;
      server.addTool({
        name: channel,
        description: `IPC handler: ${channel}`,
        parameters: anySchema,
        execute: async (args: any) => ({
          content: [{ type: 'text', text: JSON.stringify(await callTool(channel, args)) }],
        }),
      });
      registeredTools.add(channel);
    };

    for (const channel of ipcHandlers.keys()) {
      registerIpcTool(channel);
    }

    server.addTool({
      name: 'echo',
      description: 'Echoes input',
      parameters: anySchema,
      execute: async (args: any) => ({
        content: [{ type: 'text', text: JSON.stringify(args ?? null) }],
      }),
    });

    // Start FastMCP with SSE transport on /sse (legacy MCP clients)
    await server.start({ transportType: 'sse', sse: { port, endpoint: '/sse' } });
    console.log(`[MCP] FastMCP SSE listening on http://localhost:${port}/sse`);
  } catch (err: any) {
    console.error('[MCP] Failed to start FastMCP:', err);
    console.error('[MCP] Install fastmcp and zod to enable this mode');
  }
}
