/**
 * Bridge server for remote client interaction (human-in-the-loop).
 * Starts a local HTTP server that exposes pending approval requests
 * and allows remote clients (e.g., mobile web apps) to approve/deny.
 */
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';

export interface BridgeRequest {
  id: string;
  sessionId: string;
  prompt: string;
  context?: string;
  status: 'pending' | 'approved' | 'denied';
  response?: string;
  createdAt: number;
}

let server: Server | null = null;
let bridgePort = 0;
const pendingRequests = new Map<string, BridgeRequest>();

function generateId(): string {
  return `br_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // CORS headers for mobile web access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${bridgePort}`);

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const requests = Array.from(pendingRequests.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requests }));
    return;
  }

  if (url.pathname === '/api/respond' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { id, action, response } = JSON.parse(body);
        const request = pendingRequests.get(id);
        if (!request) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request not found' }));
          return;
        }
        request.status = action === 'approve' ? 'approved' : 'denied';
        request.response = response;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Simple mobile-friendly UI
  if (url.pathname === '/' && req.method === 'GET') {
    const requests = Array.from(pendingRequests.values()).filter((r) => r.status === 'pending');
    const html = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cooper Bridge</title>
<style>body{font-family:system-ui;max-width:600px;margin:0 auto;padding:16px;background:#1a1a2e;color:#e0e0e0}
.card{background:#16213e;border:1px solid #333;border-radius:8px;padding:16px;margin:8px 0}
button{padding:8px 16px;border:none;border-radius:4px;cursor:pointer;font-size:14px;margin:4px}
.approve{background:#4caf50;color:white}.deny{background:#f44336;color:white}
pre{white-space:pre-wrap;font-size:12px;background:#0a0a1a;padding:8px;border-radius:4px}</style></head>
<body><h1>🔗 Cooper Bridge</h1>
${
  requests.length === 0
    ? '<p>No pending requests</p>'
    : requests
        .map(
          (r) => `<div class="card">
<strong>${r.prompt}</strong>
${r.context ? `<pre>${r.context.slice(0, 500)}</pre>` : ''}
<div><button class="approve" onclick="respond('${r.id}','approve')">✓ Approve</button>
<button class="deny" onclick="respond('${r.id}','deny')">✗ Deny</button></div></div>`
        )
        .join('')
}
<script>function respond(id,action){fetch('/api/respond',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({id,action})}).then(()=>location.reload())}</script>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

export function startBridge(port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(bridgePort);
      return;
    }
    server = createServer(handleRequest);
    server.listen(port, '0.0.0.0', () => {
      const addr = server!.address();
      bridgePort = typeof addr === 'object' && addr ? addr.port : port;
      console.log(`[Bridge] Listening on port ${bridgePort}`);
      resolve(bridgePort);
    });
    server.on('error', reject);
  });
}

export function stopBridge(): void {
  if (server) {
    server.close();
    server = null;
    bridgePort = 0;
  }
}

export function addBridgeRequest(
  sessionId: string,
  prompt: string,
  context?: string
): BridgeRequest {
  const request: BridgeRequest = {
    id: generateId(),
    sessionId,
    prompt,
    context,
    status: 'pending',
    createdAt: Date.now(),
  };
  pendingRequests.set(request.id, request);
  return request;
}

export function getBridgeRequest(id: string): BridgeRequest | undefined {
  return pendingRequests.get(id);
}

export function getBridgePort(): number {
  return bridgePort;
}

export function clearCompletedRequests(): void {
  for (const [id, req] of pendingRequests) {
    if (req.status !== 'pending') {
      pendingRequests.delete(id);
    }
  }
}
