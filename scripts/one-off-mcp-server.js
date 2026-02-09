// Simple one-off MCP server for local testing without starting the full app
const http = require('http');

const port = 3001;

http
  .createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json && json.method === 'initialize') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: json.id || null,
                result: { capabilities: { tools: {} } },
              })
            );
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id || null, result: {} }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid json' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  })
  .listen(port, () => {
    console.log('One-off MCP server listening on http://localhost:' + port + '/mcp');
  });
