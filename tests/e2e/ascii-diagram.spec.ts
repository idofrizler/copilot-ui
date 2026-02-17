import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

// Mock messages that simulate what the AI assistant would send
const MOCK_MESSAGES = [
  {
    id: 'mock-user-1',
    role: 'user',
    content: 'Show me a session lifecycle diagram',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'mock-assistant-1',
    role: 'assistant',
    content: `Here's the session lifecycle diagram:

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SESSION START                                           │
│     ├─ Generate session ID                                  │
│     ├─ git worktree add ~/.copilot-sessions/<id> --detach   │
│     ├─ cd into worktree                                     │
│     └─ npm install (or symlink node_modules?)               │
│                                                             │
│  2. SESSION ACTIVE                                          │
│     ├─ All file ops happen in worktree                      │
│     ├─ Commits go to session branch                         │
│     └─ Can pull updates from main repo                      │
│                                                             │
│  3. SESSION END (graceful)                                  │
│     ├─ Prompt: save changes? merge? discard?                │
│     ├─ If save: push branch / create PR                     │
│     ├─ git worktree remove <path>                           │
│     └─ Delete session branch if ephemeral                   │
│                                                             │
│  4. CLEANUP (crashed sessions)                              │
│     ├─ Periodic: git worktree prune                         │
│     └─ Scan ~/.copilot-sessions for orphans                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
\`\`\``,
    timestamp: Date.now() - 50000,
  },
  {
    id: 'mock-user-2',
    role: 'user',
    content: 'How does the multi-agent architecture work?',
    timestamp: Date.now() - 40000,
  },
  {
    id: 'mock-assistant-2',
    role: 'assistant',
    content: `Here's the multi-agent architecture:

\`\`\`
┌─────────────────────────────────────────────────────┐
│                 Cooper UI                            │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│   │ Frontend │ │ Security │ │  DevOps  │  Agents   │
│   │  Agent   │ │  Agent   │ │  Agent   │           │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘           │
└────────┼────────────┼────────────┼──────────────────┘
         │            │            │
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │copilot  │  │copilot  │  │copilot  │
    │--acp    │  │--acp    │  │--acp    │
    │--agent X│  │--agent Y│  │--agent Z│
    └─────────┘  └─────────┘  └─────────┘
\`\`\`

Each agent connects to its own copilot CLI instance with the \`--agent\` flag.`,
    timestamp: Date.now() - 30000,
  },
  {
    id: 'mock-user-3',
    role: 'user',
    content: 'Show me a JavaScript function for comparison',
    timestamp: Date.now() - 20000,
  },
  {
    id: 'mock-assistant-3',
    role: 'assistant',
    content: `Here's a regular JavaScript function (this should NOT have ascii-diagram styling):

\`\`\`javascript
function calculateSum(a, b) {
  const result = a + b;
  console.log("Sum:", result);
  return result;
}

// Call the function
const total = calculateSum(5, 10);
console.log("Total:", total);
\`\`\`

And here's a simple client-server diagram:

\`\`\`
┌─────────┐     ┌─────────┐
│ Client  │────▶│ Server  │
└─────────┘     └─────────┘
\`\`\`

The diagram above should have proper alignment while the code block should use normal styling.`,
    timestamp: Date.now() - 10000,
  },
  {
    id: 'mock-user-4',
    role: 'user',
    content: 'Show me the login screen mockups',
    timestamp: Date.now() - 5000,
  },
  {
    id: 'mock-assistant-4',
    role: 'assistant',
    content: `Here are the login screen mockups:

**Not Installed Screen:**
\`\`\`
┌────────────────────────────────────────────┐
│                                            │
│             [Copilot Logo]                 │
│                                            │
│       GitHub Copilot CLI Not Found         │
│                                            │
│      GitHub Copilot CLI is required to     │
│         use this application.              │
│                                            │
│   ┌──────────────────────────────────┐     │
│   │      Install using npm:          │     │
│   │  npm install -g @githubnext/...  │     │
│   └──────────────────────────────────┘     │
│                                            │
│              [ Retry ]                     │
│                                            │
└────────────────────────────────────────────┘
\`\`\`

**Login Required Screen:**
\`\`\`
┌────────────────────────────────────────────┐
│                                            │
│             [Copilot Logo]                 │
│                                            │
│            Login Required                  │
│                                            │
│   You need to log in to GitHub Copilot     │
│         to use this application.           │
│                                            │
│      [ Log in to GitHub Copilot ]          │
│                                            │
└────────────────────────────────────────────┘
\`\`\``,
    timestamp: Date.now(),
  },
];

// Create a test HTML page that demonstrates how the diagrams would render
// with ReactMarkdown + our CSS styling in conversation messages
const createTestHTML = () => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #1e1e2e; 
      color: #cdd6f4; 
      padding: 20px;
      margin: 0;
    }
    .conversation {
      max-width: 900px;
      margin: 0 auto;
    }
    .message {
      background: #313244;
      border-radius: 12px;
      padding: 16px;
      margin: 16px 0;
    }
    .message.user {
      background: #45475a;
      margin-left: 80px;
    }
    .message.assistant {
      margin-right: 80px;
    }
    .avatar {
      font-size: 12px;
      color: #89b4fa;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .avatar.user {
      color: #a6e3a1;
    }
    p {
      margin: 8px 0;
      line-height: 1.5;
    }
    pre {
      background: #181825;
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      font-size: 13px;
      margin: 12px 0;
    }
    code {
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
    }
    /* This is the actual CSS class from global.css */
    .ascii-diagram {
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Consolas', 'DejaVu Sans Mono', monospace !important;
      line-height: 1.2 !important;
      letter-spacing: 0 !important;
      white-space: pre !important;
    }
    .regular-code {
      line-height: 1.5;
      letter-spacing: normal;
    }
    h1 { 
      color: #cba6f7; 
      border-bottom: 1px solid #45475a;
      padding-bottom: 12px;
    }
    h2 { 
      color: #f5c2e7; 
      margin-top: 40px;
      font-size: 18px;
    }
    .comparison-container {
      display: flex;
      gap: 20px;
      margin: 20px 0;
    }
    .comparison-box {
      flex: 1;
      background: #313244;
      border-radius: 8px;
      padding: 16px;
    }
    .comparison-box .label {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .comparison-box.bad .label { color: #f38ba8; }
    .comparison-box.good .label { color: #a6e3a1; }
  </style>
</head>
<body>
  <div class="conversation">
    <h1>🖼️ ASCII Diagram Rendering Demo</h1>
    <p style="color: #a6adc8;">This demonstrates how ASCII diagrams render in assistant messages with the new styling.</p>
    
    <h2>1. Session Lifecycle Diagram (from Issue #26)</h2>
    <div class="message user">
      <div class="avatar user">👤 User</div>
      <p>Can you show me a diagram of the session lifecycle?</p>
    </div>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's the session lifecycle diagram:</p>
      <pre class="ascii-diagram"><code>┌─────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SESSION START                                           │
│     ├─ Generate session ID                                  │
│     ├─ git worktree add ~/.copilot-sessions/&lt;id&gt; --detach   │
│     ├─ cd into worktree                                     │
│     └─ npm install (or symlink node_modules?)               │
│                                                             │
│  2. SESSION ACTIVE                                          │
│     ├─ All file ops happen in worktree                      │
│     ├─ Commits go to session branch                         │
│     └─ Can pull updates from main repo                      │
│                                                             │
│  3. SESSION END (graceful)                                  │
│     ├─ Prompt: save changes? merge? discard?                │
│     ├─ If save: push branch / create PR                     │
│     ├─ git worktree remove &lt;path&gt;                           │
│     └─ Delete session branch if ephemeral                   │
│                                                             │
│  4. CLEANUP (crashed sessions)                              │
│     ├─ Periodic: git worktree prune                         │
│     └─ Scan ~/.copilot-sessions for orphans                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘</code></pre>
    </div>

    <h2>2. Multi-Agent Architecture Diagram</h2>
    <div class="message user">
      <div class="avatar user">👤 User</div>
      <p>How does the multi-agent architecture work?</p>
    </div>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's the multi-agent architecture for Cooper:</p>
      <pre class="ascii-diagram"><code>┌─────────────────────────────────────────────────────┐
│                 Cooper UI                            │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│   │ Frontend │ │ Security │ │  DevOps  │  Agents   │
│   │  Agent   │ │  Agent   │ │  Agent   │           │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘           │
└────────┼────────────┼────────────┼──────────────────┘
         │            │            │
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │copilot  │  │copilot  │  │copilot  │
    │--acp    │  │--acp    │  │--acp    │
    │--agent X│  │--agent Y│  │--agent Z│
    └─────────┘  └─────────┘  └─────────┘</code></pre>
    </div>

    <h2>3. Login Screen Mockups</h2>
    <div class="message user">
      <div class="avatar user">👤 User</div>
      <p>What do the login screens look like?</p>
    </div>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's the "Not Installed" screen:</p>
      <pre class="ascii-diagram"><code>┌────────────────────────────────────────────┐
│                                            │
│             [Copilot Logo]                 │
│                                            │
│       GitHub Copilot CLI Not Found         │
│                                            │
│      GitHub Copilot CLI is required to     │
│         use this application.              │
│                                            │
│   ┌──────────────────────────────────┐     │
│   │      Install using npm:          │     │
│   │  npm install -g @githubnext/...  │     │
│   └──────────────────────────────────┘     │
│                                            │
│              [ Retry ]                     │
│                                            │
└────────────────────────────────────────────┘</code></pre>
      <p>And the "Login Required" screen:</p>
      <pre class="ascii-diagram"><code>┌────────────────────────────────────────────┐
│                                            │
│             [Copilot Logo]                 │
│                                            │
│            Login Required                  │
│                                            │
│   You need to log in to GitHub Copilot     │
│         to use this application.           │
│                                            │
│      [ Log in to GitHub Copilot ]          │
│                                            │
└────────────────────────────────────────────┘</code></pre>
    </div>

    <h2>4. Classic ASCII Art (+---+ style)</h2>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's a simple flow diagram:</p>
      <pre class="ascii-diagram"><code>+---------------+
|  Hello World  |
+---------------+
      |
      v
+---------------+
|   Process     |
+---------------+
      |
      v
+---------------+
|   Output      |
+---------------+</code></pre>
    </div>

    <h2>5. Regular Code (Should NOT have ascii-diagram styling)</h2>
    <div class="message user">
      <div class="avatar user">👤 User</div>
      <p>Show me a JavaScript function</p>
    </div>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's a JavaScript function:</p>
      <pre class="regular-code"><code>function calculateSum(a, b) {
  const result = a + b;
  console.log("Sum:", result);
  return result;
}

// Call the function
const total = calculateSum(5, 10);
console.log("Total:", total);</code></pre>
      <p>This code calculates the sum of two numbers.</p>
    </div>

    <h2>6. Side-by-Side Comparison: With vs Without Styling</h2>
    <p style="color: #a6adc8;">This shows the difference the <code>ascii-diagram</code> CSS class makes:</p>
    <div class="comparison-container">
      <div class="comparison-box bad">
        <div class="label">❌ Without ascii-diagram class</div>
        <pre class="regular-code"><code>┌─────────┐
│  Box 1  │
├─────────┤
│  Box 2  │
└─────────┘</code></pre>
        <p style="font-size: 12px; color: #a6adc8;">Notice: lines may not align properly</p>
      </div>
      <div class="comparison-box good">
        <div class="label">✅ With ascii-diagram class</div>
        <pre class="ascii-diagram"><code>┌─────────┐
│  Box 1  │
├─────────┤
│  Box 2  │
└─────────┘</code></pre>
        <p style="font-size: 12px; color: #a6adc8;">Lines align perfectly with optimized styling</p>
      </div>
    </div>

    <h2>7. Mixed Content (Code + Diagram)</h2>
    <div class="message assistant">
      <div class="avatar">🤖 Assistant</div>
      <p>Here's how the data flows:</p>
      <pre class="ascii-diagram"><code>┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │────▶│ Server  │────▶│   DB    │
└─────────┘     └─────────┘     └─────────┘</code></pre>
      <p>And here's the code that handles it:</p>
      <pre class="regular-code"><code>async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}</code></pre>
    </div>

  </div>
</body>
</html>
`;

test.describe('ASCII Diagram Rendering in Conversation', () => {
  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    window = await electronApp.firstWindow();

    // Set desktop viewport size (tests should run in desktop mode, not mobile)
    await window.setViewportSize({ width: 1280, height: 800 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('01 - App launches successfully', async () => {
    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/01-app-launched.png'),
    });
  });

  test('02 - CSS class ascii-diagram is defined', async () => {
    const hasStyle = await window.evaluate(() => {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          for (let j = 0; j < rules.length; j++) {
            if (rules[j].cssText?.includes('ascii-diagram')) {
              return rules[j].cssText;
            }
          }
        } catch (e) {
          /* cross-origin */
        }
      }
      return null;
    });

    expect(hasStyle).toBeTruthy();
    console.log('Found CSS rule:', hasStyle);
  });

  test('03 - Load diagram rendering demo', async () => {
    // Write demo HTML to evidence folder
    const htmlPath = path.join(__dirname, '../../evidence/diagram-rendering-demo.html');
    fs.writeFileSync(htmlPath, createTestHTML());

    // Load it in the Electron window
    await window.goto(`file://${htmlPath}`);
    await window.waitForTimeout(500);

    // Full page screenshot
    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/03-full-demo-page.png'),
      fullPage: true,
    });
  });

  test('04 - Session Lifecycle Diagram (Issue Example 1)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[0]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/04-session-lifecycle-diagram.png'),
    });
  });

  test('05 - Multi-Agent Architecture Diagram (Issue Example 3)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[1]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/05-multi-agent-architecture.png'),
    });
  });

  test('06 - Login Screen Mockups (Issue Example 2)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[2]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/06-login-screen-mockups.png'),
    });
  });

  test('07 - Classic ASCII Art (+---+ style)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[3]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/07-classic-ascii-art.png'),
    });
  });

  test('08 - Regular Code Block (no special styling)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[4]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/08-regular-code-block.png'),
    });
  });

  test('09 - Side-by-Side Comparison', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[5]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/09-comparison-with-without.png'),
    });
  });

  test('10 - Mixed Content (Code + Diagram)', async () => {
    await window.evaluate(() => {
      document.querySelectorAll('h2')[6]?.scrollIntoView({ block: 'start' });
    });
    await window.waitForTimeout(300);

    await window.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/10-mixed-content.png'),
    });
  });
});

// Second test suite: Inject mock messages into the ACTUAL app
test.describe('ASCII Diagram in Real App (Mocked Messages)', () => {
  let app: ElectronApplication;
  let appWindow: Page;

  test.beforeAll(async () => {
    // Launch a fresh Electron app instance
    app = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    appWindow = await app.firstWindow();

    // Enable test helpers BEFORE app fully initializes
    await appWindow.evaluate(() => {
      (window as any).__ENABLE_TEST_HELPERS__ = true;
    });

    await appWindow.waitForLoadState('domcontentloaded');
    await appWindow.waitForTimeout(3000); // Wait for app to fully initialize
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test('11 - Inject mock conversation with ASCII diagrams', async () => {
    // Wait for the app to be ready (look for the main container)
    await appWindow.waitForSelector('[class*="flex"]', { timeout: 10000 });

    // Wait a bit more for React to fully initialize
    await appWindow.waitForTimeout(1000);

    // Check if test helpers are available
    const hasTestHelpers = await appWindow.evaluate(() => {
      return typeof (window as any).__TEST_HELPERS__ !== 'undefined';
    });

    console.log('Test helpers available:', hasTestHelpers);

    if (hasTestHelpers) {
      // Use the exposed test API to inject messages
      await appWindow.evaluate((messages) => {
        const helpers = (window as any).__TEST_HELPERS__;
        if (helpers && helpers.injectMessages) {
          helpers.injectMessages(messages);
        }
      }, MOCK_MESSAGES);

      await appWindow.waitForTimeout(1500); // Wait for React to re-render

      // Find the messages container (has overflow-y-auto and contains messages)
      // Then scroll to the top to see the first messages
      const scrolled = await appWindow.evaluate(() => {
        // Find elements with overflow-y-auto class
        const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
        for (const container of containers) {
          // Look for the one that has child divs (messages)
          if (container.children.length > 0 && container.scrollHeight > container.clientHeight) {
            container.scrollTop = 0;
            return {
              found: true,
              scrollHeight: container.scrollHeight,
              childCount: container.children.length,
            };
          }
        }
        // Fallback: scroll any overflow container to top
        containers.forEach((c) => ((c as HTMLElement).scrollTop = 0));
        return { found: false, containerCount: containers.length };
      });
      console.log('Scroll result:', scrolled);

      await appWindow.waitForTimeout(500);

      await appWindow.screenshot({
        path: path.join(__dirname, '../../evidence/screenshots/11-real-app-session-lifecycle.png'),
      });
    } else {
      await appWindow.screenshot({
        path: path.join(__dirname, '../../evidence/screenshots/11-app-no-test-helpers.png'),
      });
    }
  });

  test('11b - Scroll to multi-agent architecture diagram', async () => {
    // Scroll down to see more messages
    const scrolled = await appWindow.evaluate(() => {
      const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
      for (const container of containers) {
        if (container.scrollHeight > container.clientHeight) {
          // Scroll to about 30% of the content
          container.scrollTop = container.scrollHeight * 0.3;
          return { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
        }
      }
      return null;
    });
    console.log('Scroll to 30%:', scrolled);
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/11b-real-app-multi-agent.png'),
    });
  });

  test('11c - Scroll to code comparison section', async () => {
    // Scroll to about 60% to see code vs diagram comparison
    const scrolled = await appWindow.evaluate(() => {
      const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
      for (const container of containers) {
        if (container.scrollHeight > container.clientHeight) {
          container.scrollTop = container.scrollHeight * 0.6;
          return { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
        }
      }
      return null;
    });
    console.log('Scroll to 60%:', scrolled);
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/11c-real-app-code-vs-diagram.png'),
    });
  });

  test('11d - Scroll to login mockups', async () => {
    // Scroll to bottom for login mockups
    const scrolled = await appWindow.evaluate(() => {
      const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
      for (const container of containers) {
        if (container.scrollHeight > container.clientHeight) {
          container.scrollTop = container.scrollHeight;
          return { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
        }
      }
      return null;
    });
    console.log('Scroll to bottom:', scrolled);
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/11d-real-app-login-mockups.png'),
    });
  });

  test('12 - Alternative: Render messages via DOM manipulation', async () => {
    // Generate HTML for the mock conversation outside the evaluate
    function generateMockHTML(messages: typeof MOCK_MESSAGES): string {
      const msgHtml = messages
        .map((msg) => {
          let content = msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

          // Replace code blocks
          content = content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            // Check if it's an ASCII diagram
            const boxChars = (code.match(/[\u2500-\u257F]/g) || []).length;
            const isAscii = boxChars >= 3 || /\+[-=]+\+|\|.+\|/g.test(code);
            const className = isAscii ? 'ascii-diagram' : '';
            return (
              '<pre class="' +
              className +
              '" style="background: #15161e; border-radius: 6px; padding: 12px; margin: 8px 0; overflow-x: auto; font-size: 13px;"><code style="font-family: SF Mono, Menlo, Monaco, monospace;">' +
              code +
              '</code></pre>'
            );
          });

          // Replace inline code
          content = content.replace(
            /`([^`]+)`/g,
            '<code style="background: #292e42; padding: 2px 6px; border-radius: 4px; font-size: 13px;">$1</code>'
          );

          const bgColor = msg.role === 'user' ? '#3b4261' : '#1f2335';
          const labelColor = msg.role === 'user' ? '#9ece6a' : '#7aa2f7';
          const label = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
          const margin = msg.role === 'user' ? 'margin-left: 60px;' : 'margin-right: 60px;';

          return (
            '<div style="background: ' +
            bgColor +
            '; border-radius: 12px; padding: 16px; margin: 12px 0; ' +
            margin +
            '">' +
            '<div style="font-size: 12px; color: ' +
            labelColor +
            '; margin-bottom: 8px;">' +
            label +
            '</div>' +
            '<div style="white-space: pre-wrap;">' +
            content +
            '</div>' +
            '</div>'
          );
        })
        .join('');

      return (
        '<div style="max-width: 800px; margin: 0 auto;">' +
        '<div style="background: #24283b; padding: 16px; border-radius: 8px; margin-bottom: 20px;">' +
        '<h2 style="color: #7aa2f7; margin: 0;">🧪 Mock Conversation Demo</h2>' +
        '<p style="color: #565f89; margin: 8px 0 0;">This demonstrates how ASCII diagrams render in the actual app styling context.</p>' +
        '</div>' +
        msgHtml +
        '<button onclick="document.getElementById(\'mock-conversation-demo\').remove()" style="position: fixed; top: 20px; right: 20px; background: #f7768e; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;">Close Demo</button>' +
        '</div>'
      );
    }

    const mockHTML = generateMockHTML(MOCK_MESSAGES);

    const result = await appWindow.evaluate((html) => {
      // Create a demo overlay
      const overlay = document.createElement('div');
      overlay.id = 'mock-conversation-demo';
      overlay.style.cssText =
        'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #1a1b26; z-index: 9999; overflow-y: auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; color: #c0caf5;';
      overlay.innerHTML = html;
      document.body.appendChild(overlay);
      return { success: true, method: 'overlay' };
    }, mockHTML);

    console.log('DOM manipulation result:', result);

    await appWindow.waitForTimeout(500);
    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/12-mock-conversation-overlay.png'),
      fullPage: true,
    });
  });

  test('13 - Scroll through mock conversation', async () => {
    // Scroll down to see more messages
    await appWindow.evaluate(() => {
      const overlay = document.getElementById('mock-conversation-demo');
      if (overlay) {
        overlay.scrollTop = 400;
      }
    });
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/13-mock-conversation-scrolled.png'),
    });
  });

  test('14 - View multi-agent architecture in mock', async () => {
    await appWindow.evaluate(() => {
      const overlay = document.getElementById('mock-conversation-demo');
      if (overlay) {
        overlay.scrollTop = 1200;
      }
    });
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/14-mock-multi-agent-diagram.png'),
    });
  });

  test('15 - View login mockups in mock conversation', async () => {
    await appWindow.evaluate(() => {
      const overlay = document.getElementById('mock-conversation-demo');
      if (overlay) {
        overlay.scrollTop = overlay.scrollHeight;
      }
    });
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/15-mock-login-mockups.png'),
    });
  });

  test('16 - Close overlay and show real app', async () => {
    await appWindow.evaluate(() => {
      const overlay = document.getElementById('mock-conversation-demo');
      if (overlay) {
        overlay.remove();
      }
    });
    await appWindow.waitForTimeout(300);

    await appWindow.screenshot({
      path: path.join(__dirname, '../../evidence/screenshots/16-real-app-after-demo.png'),
    });
  });
});
