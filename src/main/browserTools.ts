/**
 * Browser Automation Tools for Copilot SDK
 *
 * Defines custom tools that allow the AI to control a browser for web automation.
 * These tools are registered with the Copilot SDK session and can be invoked by the AI.
 */

import { z } from 'zod';
import { defineTool, Tool } from '@github/copilot-sdk';
import * as browser from './browser';

/**
 * Create browser automation tools for a specific Copilot session
 */
export function createBrowserTools(sessionId: string): Tool<any>[] {
  return [
    // Navigate to a URL
    defineTool('browser_navigate', {
      description:
        "Open a web browser and navigate to a URL. The browser window will be visible to the user. Use this to access websites, web applications, or any URL. The browser persists login sessions so the user won't need to re-login each time.",
      parameters: z.object({
        url: z.string().describe('The URL to navigate to (must start with http:// or https://)'),
      }),
      handler: async (args) => {
        const result = await browser.navigateTo(sessionId, args.url);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Click an element
    defineTool('browser_click', {
      description:
        'Click on an element in the browser. Use CSS selectors to identify the element (e.g., "button.submit", "#login-btn", "[data-testid=\'submit\']").',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the element to click'),
      }),
      handler: async (args) => {
        const result = await browser.clickElement(sessionId, args.selector);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Fill a form input
    defineTool('browser_fill', {
      description:
        'Fill a form input field with a value. Clears existing content first. Use CSS selectors to identify the input.',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the input field'),
        value: z.string().describe('The value to fill in'),
      }),
      handler: async (args) => {
        const result = await browser.fillInput(sessionId, args.selector, args.value);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Type text (simulates keyboard)
    defineTool('browser_type', {
      description:
        'Type text into an element, simulating keyboard input. Useful when you need to trigger keyboard events (like autocomplete). First clicks the element, then types.',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the element to type into'),
        text: z.string().describe('The text to type'),
      }),
      handler: async (args) => {
        const result = await browser.typeText(sessionId, args.selector, args.text);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Press a keyboard key
    defineTool('browser_press_key', {
      description:
        'Press a keyboard key. Common keys: "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace".',
      parameters: z.object({
        key: z.string().describe('The key to press (e.g., "Enter", "Tab", "Escape")'),
      }),
      handler: async (args) => {
        const result = await browser.pressKey(sessionId, args.key);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Take a screenshot
    defineTool('browser_screenshot', {
      description:
        'Take a screenshot of the current browser page. Vision-capable models (GPT-5, Claude Opus/Sonnet) can analyze the image directly. For non-vision models, use browser_get_text or browser_get_html instead to read page content.',
      parameters: z.object({
        fullPage: z
          .boolean()
          .optional()
          .describe('If true, capture the full scrollable page. Default is false (viewport only).'),
        includeTextFallback: z
          .boolean()
          .optional()
          .describe(
            'If true, also include visible text content for non-vision models. Default is false.'
          ),
      }),
      handler: async (args) => {
        const result = await browser.takeScreenshot(sessionId, args.fullPage || false);
        if (!result.success) {
          return result.message;
        }

        const screenshotData = result.data as { base64: string };

        // If text fallback requested, also get page text for non-vision models
        let textFallback = 'Screenshot captured successfully.';
        if (args.includeTextFallback) {
          const textResult = await browser.getTextContent(sessionId);
          if (textResult.success && textResult.data) {
            const pageText = (textResult.data as string).substring(0, 2000);
            textFallback = `Screenshot captured. Page text content (for non-vision models):\n${pageText}`;
          }
        } else {
          textFallback =
            'Screenshot captured successfully. If you cannot see images, use browser_get_text to read the page content.';
        }

        // Return with both image (for vision models) and text fallback
        return {
          textResultForLlm: textFallback,
          binaryResultsForLlm: [
            {
              data: screenshotData.base64,
              mimeType: 'image/png',
              type: 'image',
              description: 'Browser screenshot',
            },
          ],
          resultType: 'success' as const,
        };
      },
    }),

    // Get text content
    defineTool('browser_get_text', {
      description:
        'Get the text content from the page or a specific element. Useful for reading page content.',
      parameters: z.object({
        selector: z
          .string()
          .optional()
          .describe(
            'CSS selector for a specific element. If omitted, returns the full page body text.'
          ),
      }),
      handler: async (args) => {
        const result = await browser.getTextContent(sessionId, args.selector);
        if (!result.success) {
          return { error: result.message };
        }
        return result.data as string;
      },
    }),

    // Get page HTML
    defineTool('browser_get_html', {
      description:
        'Get the HTML content from the page or a specific element. Useful for understanding page structure.',
      parameters: z.object({
        selector: z
          .string()
          .optional()
          .describe('CSS selector for a specific element. If omitted, returns the full page HTML.'),
      }),
      handler: async (args) => {
        const result = await browser.getPageHtml(sessionId, args.selector);
        if (!result.success) {
          return { error: result.message };
        }
        return result.data as string;
      },
    }),

    // Wait for element
    defineTool('browser_wait_for_element', {
      description:
        'Wait for an element to appear on the page. Use this after actions that trigger page changes.',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the element to wait for'),
        timeout: z
          .number()
          .optional()
          .describe('Maximum wait time in milliseconds. Default is 10000 (10 seconds).'),
      }),
      handler: async (args) => {
        const result = await browser.waitForElement(sessionId, args.selector, args.timeout);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Get current page info
    defineTool('browser_get_page_info', {
      description: 'Get information about the current page, including URL and title.',
      parameters: z.object({}),
      handler: async () => {
        const result = await browser.getPageInfo(sessionId);
        if (!result.success) {
          return { error: result.message };
        }
        return JSON.stringify(result.data);
      },
    }),

    // Select dropdown option
    defineTool('browser_select_option', {
      description: 'Select an option from a dropdown (select element).',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the select element'),
        value: z.string().describe('The value or visible text of the option to select'),
      }),
      handler: async (args) => {
        const result = await browser.selectOption(sessionId, args.selector, args.value);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Checkbox
    defineTool('browser_checkbox', {
      description: 'Check or uncheck a checkbox.',
      parameters: z.object({
        selector: z.string().describe('CSS selector for the checkbox'),
        checked: z.boolean().describe('Whether to check (true) or uncheck (false) the checkbox'),
      }),
      handler: async (args) => {
        const result = await browser.setCheckbox(sessionId, args.selector, args.checked);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Scroll
    defineTool('browser_scroll', {
      description: 'Scroll the page or scroll to a specific element.',
      parameters: z.object({
        direction: z
          .enum(['up', 'down', 'top', 'bottom'])
          .optional()
          .describe('Direction to scroll. Ignored if selector is provided.'),
        selector: z.string().optional().describe('CSS selector for an element to scroll into view'),
      }),
      handler: async (args) => {
        const result = await browser.scroll(sessionId, args.direction || 'down', args.selector);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Go back
    defineTool('browser_go_back', {
      description: 'Go back to the previous page in browser history.',
      parameters: z.object({}),
      handler: async () => {
        const result = await browser.goBack(sessionId);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Reload
    defineTool('browser_reload', {
      description: 'Reload the current page.',
      parameters: z.object({}),
      handler: async () => {
        const result = await browser.reload(sessionId);
        if (!result.success) {
          return { error: result.message };
        }
        return result.message;
      },
    }),

    // Get links
    defineTool('browser_get_links', {
      description:
        'Get all links on the current page. Returns up to 50 links with their text and URLs.',
      parameters: z.object({}),
      handler: async () => {
        const result = await browser.getLinks(sessionId);
        if (!result.success) {
          return { error: result.message };
        }
        return JSON.stringify(result.data);
      },
    }),

    // Get form inputs
    defineTool('browser_get_form_inputs', {
      description:
        'Get all form inputs on the current page. Useful for understanding what fields need to be filled.',
      parameters: z.object({}),
      handler: async () => {
        const result = await browser.getFormInputs(sessionId);
        if (!result.success) {
          return { error: result.message };
        }
        return JSON.stringify(result.data);
      },
    }),

    // Close browser
    defineTool('browser_close', {
      description:
        'Close the browser window for this session. The login state will be preserved for next time.',
      parameters: z.object({}),
      handler: async () => {
        await browser.closeSessionPage(sessionId);
        return 'Browser closed. Login sessions have been saved and will persist for next time.';
      },
    }),
  ];
}
