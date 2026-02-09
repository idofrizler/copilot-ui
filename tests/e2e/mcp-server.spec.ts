import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import path from 'path';

const MCP_URL = 'http://localhost:3000/sse';
const MCP_PROTOCOL_VERSION = '2024-11-05';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseSseJson = (text: string) => {
  const lines = text.split(/\r?\n/);
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    } else if (line.trim() === '' && data) {
      try {
        return JSON.parse(data);
      } catch {
        data = '';
      }
    }
  }
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
};

const mcpRequest = async (payload: object, endpoint: string) => {
  const response = await fetch(`http://localhost:3000${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  expect(response.ok).toBe(true);
  return response;
};

const waitForMcpServer = async () => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(MCP_URL, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await delay(500);
  }
  throw new Error('MCP server did not start within 20 seconds.');
};

const openSseConnection = async (): Promise<Response> => {
  return fetch(MCP_URL, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
};

const readSseEndpoint = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Missing SSE response body');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        return { endpoint: line.slice(5).trim(), reader };
      }
    }
  }
  throw new Error('Failed to read SSE endpoint');
};

const readSseMessage = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\r?\n\r?\n/);
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const parsed = parseSseJson(chunk);
      if (parsed) {
        return parsed;
      }
    }
  }
  throw new Error('Failed to read SSE message');
};

const readSseMessageById = async (reader: ReadableStreamDefaultReader<Uint8Array>, id: number) => {
  while (true) {
    const message = await readSseMessage(reader);
    if (message?.id === id) {
      return message;
    }
  }
};

const initializeSession = async () => {
  const sseResponse = await openSseConnection();
  const { endpoint, reader } = await readSseEndpoint(sseResponse);
  const sessionId = new URL(`http://localhost:3000${endpoint}`).searchParams.get('sessionId');
  expect(sessionId).toBeTruthy();

  await mcpRequest(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'cooper-e2e', version: '1.0' },
      },
    },
    endpoint
  );
  await readSseMessageById(reader, 1);

  await mcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, endpoint);

  return { endpoint, reader, sseResponse };
};

const closeSession = async (session: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  sseResponse: Response;
}) => {
  await session.reader.cancel();
};

test.describe('MCP Server', () => {
  let electronApp: ElectronApplication;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    await electronApp.firstWindow();
    await waitForMcpServer();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('should initialize and call echo tool', async () => {
    const session = await initializeSession();
    await mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, session.endpoint);
    const toolList = await readSseMessageById(session.reader, 2);
    const toolNames = toolList?.result?.tools?.map((tool: any) => tool.name) || [];
    expect(toolNames).toContain('echo');

    const args = { message: 'Hello from MCP e2e', timestamp: '2026-02-09T10:37:27.161Z' };
    await mcpRequest(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: args } },
      session.endpoint
    );
    const toolCall = await readSseMessageById(session.reader, 3);
    const textContent = toolCall?.result?.content?.find((item: any) => item.type === 'text')?.text;
    expect(textContent).toBe(JSON.stringify(args));

    await closeSession(session);
  });

  test('should expose IPC handlers as MCP tools', async () => {
    const session = await initializeSession();
    await mcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, session.endpoint);
    const toolList = await readSseMessageById(session.reader, 4);
    const toolNames = toolList?.result?.tools?.map((tool: any) => tool.name) || [];
    expect(toolNames).toContain('copilot:getCwd');

    await mcpRequest(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'copilot:getCwd' } },
      session.endpoint
    );
    const toolCall = await readSseMessageById(session.reader, 5);
    const textContent = toolCall?.result?.content?.find((item: any) => item.type === 'text')?.text;
    expect(textContent).toBeTruthy();
    expect(textContent).toContain(':');

    await closeSession(session);
  });
});
