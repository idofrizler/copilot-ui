# Cooper MCP Server

Cooper includes a built-in **MCP (Model Context Protocol) server** that exposes all IPC endpoints as HTTP APIs. This allows external tools and automation to control Cooper programmatically.

## Features

- **Zero configuration** - Automatically exposes all IPC handlers as HTTP endpoints
- **Self-documenting** - `GET /ipc` lists all available endpoints
- **Localhost-only** - Binds to `localhost:3000` for security (no auth needed)
- **Future-proof** - New IPC handlers are automatically exposed without code changes

## Starting the Server

The MCP server starts automatically when Cooper launches and listens on **http://localhost:3000**.

```bash
npm run dev    # Development mode
npm start      # Production mode
```

Look for this in the console:

```
[MCP] Server listening on http://localhost:3000
[MCP] 110 IPC handlers exposed
[MCP] List endpoints: http://localhost:3000/ipc
```

## Endpoints

### Health Check

```bash
curl http://localhost:3000/health
# {"status":"ok","handlers":110}
```

### List All Endpoints

```bash
curl http://localhost:3000/ipc
```

Returns:

```json
{
  "count": 110,
  "endpoints": [
    { "channel": "copilot:createSession", "endpoint": "/ipc/copilot/createSession" },
    { "channel": "worktree:createSession", "endpoint": "/ipc/worktree/createSession" },
    ...
  ],
  "usage": "POST /ipc/{namespace}/{method} with JSON body"
}
```

### Call an IPC Endpoint

Format: `POST /ipc/{namespace}/{method}`

The request body is passed as the parameter to the IPC handler.

## Examples

### Check Git Version

```bash
curl -X POST http://localhost:3000/ipc/worktree/checkGitVersion \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:

```json
{
  "success": true,
  "data": {
    "supported": true,
    "version": "2.52"
  }
}
```

### List Worktree Sessions

```bash
curl -X POST http://localhost:3000/ipc/worktree/listSessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Create Worktree Session

```bash
curl -X POST http://localhost:3000/ipc/worktree/createSession \
  -H "Content-Type: application/json" \
  -d '{
    "repoPath": "C:\\path\\to\\repo",
    "branch": "feature/my-branch"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "success": true,
    "session": {
      "id": "repo--feature-my-branch",
      "repoPath": "C:\\path\\to\\repo",
      "branch": "feature/my-branch",
      "worktreePath": "C:\\Users\\user\\.copilot-sessions\\repo--feature-my-branch",
      "createdAt": "2026-02-08T21:40:00.000Z",
      "lastAccessedAt": "2026-02-08T21:40:00.000Z",
      "status": "active"
    }
  }
}
```

### Create Copilot Session

```bash
curl -X POST http://localhost:3000/ipc/copilot/createSession \
  -H "Content-Type: application/json" \
  -d '{"cwd": "C:\\Users\\user\\.copilot-sessions\\repo--feature-my-branch"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "sessionId": "session-1770587000000-abc123",
    "model": "claude-sonnet-4.5",
    "cwd": "C:\\Users\\user\\.copilot-sessions\\repo--feature-my-branch"
  }
}
```

### Get Current Working Directory

```bash
curl -X POST http://localhost:3000/ipc/copilot/getCwd \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Key Worktree Endpoints

| Endpoint                         | Purpose                                |
| -------------------------------- | -------------------------------------- |
| `/ipc/worktree/createSession`    | Create git worktree + session metadata |
| `/ipc/worktree/listSessions`     | List all worktree sessions             |
| `/ipc/worktree/removeSession`    | Remove a worktree session              |
| `/ipc/worktree/getSession`       | Get session by ID                      |
| `/ipc/worktree/findSession`      | Find session by repo + branch          |
| `/ipc/worktree/fetchGitHubIssue` | Parse GitHub issue URL                 |
| `/ipc/worktree/checkGitVersion`  | Validate git version                   |
| `/ipc/worktree/getConfig`        | Get worktree configuration             |

## Key Copilot Endpoints

| Endpoint                     | Purpose                       |
| ---------------------------- | ----------------------------- |
| `/ipc/copilot/createSession` | Create new Copilot session    |
| `/ipc/copilot/closeSession`  | Close a session               |
| `/ipc/copilot/send`          | Send message to agent         |
| `/ipc/copilot/getMessages`   | Get conversation history      |
| `/ipc/copilot/setModel`      | Change model mid-session      |
| `/ipc/copilot/getModels`     | List available models         |
| `/ipc/copilot/getCwd`        | Get current working directory |

## Error Handling

Errors return a 500 status with details:

```json
{
  "success": false,
  "error": "Not a git repository: C:\\invalid\\path"
}
```

404 if endpoint doesn't exist:

```json
{
  "success": false,
  "error": "Handler not found: invalid:endpoint",
  "available": ["copilot:send", "worktree:createSession", ...]
}
```

## Testing

Two test scripts are included:

```bash
# Test basic MCP functionality
node test-mcp.js

# Test worktree-specific endpoints
node test-mcp-worktree.js
```

Make sure Cooper is running first!

## Architecture

The MCP server is a thin HTTP wrapper around Cooper's existing IPC handlers:

1. **`wrapIpcMain()`** - Intercepts all `ipcMain.handle()` calls at startup
2. **Express server** - Maps `POST /ipc/{namespace}/{method}` → `{namespace}:{method}` IPC handler
3. **Zero hardcoding** - New IPC handlers are automatically exposed

See `src/main/mcp-server.ts` for implementation (only ~120 lines).

## Configuration

The server is currently hardcoded to port 3000. To change:

1. Edit `src/main/main.ts`
2. Change `startMCPServer(3000)` to your preferred port
3. Rebuild: `npm run build`

## Security

- **Localhost-only** - Binds to `localhost`, not accessible from network
- **No authentication** - Intended for local automation only
- **Same permissions** - Inherits Cooper's file system trust model
- **Not for production** - This is for local development workflows

## Use Cases

- **CLI automation** - Script worktree creation from issue IDs
- **CI/CD integration** - Trigger Cooper sessions from pipelines
- **External tools** - Let other apps control Cooper (VS Code extensions, Alfred workflows, etc.)
- **Testing** - Automated testing of Cooper functionality

## Future Ideas

- WebSocket support for streaming messages
- Configuration file for port/host
- Rate limiting
- API key authentication (optional)
- GraphQL endpoint

---

**Implementation:** `src/main/mcp-server.ts` (~120 lines)  
**Modified:** `src/main/main.ts` (3 lines added)  
**Dependencies:** `express` (already minimal)
