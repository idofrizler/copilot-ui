# Cooper MCP Server

Cooper includes a built-in **MCP (Model Context Protocol) server** that exposes all IPC endpoints as MCP tools. This allows external tools and automation to control Cooper programmatically.

## Features

- **Zero configuration** - Automatically exposes all IPC handlers as MCP tools
- **Localhost-only** - Binds to `localhost:3000` for security (no auth needed)
- **Future-proof** - New IPC handlers are automatically exposed without code changes

## Starting the Server

The MCP server starts automatically when Cooper launches and listens on **http://localhost:3000/sse**.

```bash
npm run dev    # Development mode
npm start      # Production mode
```

Look for this in the console:

```
[MCP] FastMCP SSE listening on http://localhost:3000/sse
```

## MCP Usage

All IPC handlers are exposed as MCP tools with the same name (for example,
`copilot:getCwd` or `worktree:listSessions`). Use MCP `tools/list` to discover
tools and `tools/call` to invoke them.

## Key Worktree Tools

| Tool name                   | Purpose                                |
| --------------------------- | -------------------------------------- |
| `worktree:createSession`    | Create git worktree + session metadata |
| `worktree:listSessions`     | List all worktree sessions             |
| `worktree:removeSession`    | Remove a worktree session              |
| `worktree:getSession`       | Get session by ID                      |
| `worktree:findSession`      | Find session by repo + branch          |
| `worktree:fetchGitHubIssue` | Parse GitHub issue URL                 |
| `worktree:checkGitVersion`  | Validate git version                   |
| `worktree:getConfig`        | Get worktree configuration             |

## Key Copilot Tools

| Tool name               | Purpose                       |
| ----------------------- | ----------------------------- |
| `copilot:createSession` | Create new Copilot session    |
| `copilot:closeSession`  | Close a session               |
| `copilot:send`          | Send message to agent         |
| `copilot:getMessages`   | Get conversation history      |
| `copilot:setModel`      | Change model mid-session      |
| `copilot:getModels`     | List available models         |
| `copilot:getCwd`        | Get current working directory |

## Testing

Use the Playwright E2E test to validate the MCP server:

```bash
npm run test:e2e -- tests/e2e/mcp-server.spec.ts
```

This launches the Electron app and validates MCP initialize, tools/list, echo, and an IPC-backed tool.

## Architecture

The MCP server is a thin wrapper around Cooper's existing IPC handlers:

1. **`wrapIpcMain()`** - Intercepts all `ipcMain.handle()` calls at startup
2. **FastMCP server** - Exposes each IPC handler as a tool with the same name
3. **Zero hardcoding** - New IPC handlers are automatically exposed

See `src/main/mcp-server.ts` for implementation.

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

**Implementation:** `src/main/mcp-server.ts`  
**Modified:** `src/main/main.ts` (3 lines added)  
**Dependencies:** `fastmcp`, `@modelcontextprotocol/sdk`
