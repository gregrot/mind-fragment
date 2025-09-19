---
inclusion: manual
---

# Development Server and Playwright Testing Guide

This steering document describes how to set up the development server for the simplified-stack-blocks library and use Playwright MCP for testing the UI functionality.

## Development Server Setup

### Starting the Dev Server

The project uses Vite for development with a custom configuration for the example app:

```bash
# Start the development server
npm run dev
```

This command:
- Runs `vite --config vite.example.config.ts --open`
- Serves the example application at `http://localhost:3000` (or next available port)
- Automatically opens the browser
- Provides hot module replacement for development

### Dev Server Configuration

The dev server is configured in `vite.example.config.ts` to:
- Serve the example React application from `example/App.tsx`
- Use the library source code directly (no build step needed)
- Enable hot reload for rapid development
- Handle TypeScript compilation on-the-fly

### Running in Background

For testing purposes, you can run the dev server in the background:

```bash
# Start server in background (doesn't work with &)
nohup npm run dev > dev.log 2>&1 &

# Check if server is running
lsof -i :3001

# View server logs
cat dev.log

# Stop background server
pkill -f "npm run dev"
```

**Note**: The `&` operator doesn't work reliably with npm scripts. Use `nohup` for background execution.

## Playwright MCP Testing

### Overview

The Playwright MCP (Model Context Protocol) provides browser automation capabilities for testing the visual programming interface. It's particularly useful for testing drag-and-drop functionality that's difficult to test with traditional unit tests.

### Available Playwright Tools

Key tools for testing the stack blocks interface:

- `mcp_playwright_browser_navigate` - Navigate to the dev server
- `mcp_playwright_browser_snapshot` - Capture page state and elements
- `mcp_playwright_browser_drag` - Test drag and drop functionality
- `mcp_playwright_browser_click` - Test click interactions
- `mcp_playwright_browser_console_messages` - Check for JavaScript errors
- `mcp_playwright_browser_close` - Clean up browser session

### Testing Workflow

1. **Start the dev server** (ensure it's running on expected port)
2. **Navigate to the application**:
   ```javascript
   await page.goto('http://localhost:3001');
   ```

3. **Capture initial state**:
   ```javascript
   // Get page snapshot to see available elements
   await page.screenshot();
   ```

4. **Test interactions**:
   ```javascript
   // Test clicking blocks from palette
   await page.getByText('when green flag clicked').click();
   
   // Test drag and drop
   await page.getByText('say').dragTo(page.getByText('Drop blocks here'));
   ```

5. **Verify results**:
   ```javascript
   // Check console for errors or success messages
   console.log(await page.evaluate(() => console.messages));
   
   // Verify DOM changes
   await page.screenshot();
   ```

### Common Testing Patterns

#### Testing Drag and Drop

```javascript
// Drag from palette to program area
await page.getByText('block-name').dragTo(page.getByText('Drop blocks here'));

// Drag to specific position (existing blocks)
await page.getByText('source-block').dragTo(page.getByText('target-block'));
```

#### Verifying Program State

```javascript
// Check program statistics
const stats = await page.getByText('Total blocks:').textContent();

// Verify JSON structure
const json = await page.locator('pre').first().textContent();
```

#### Debugging Issues

```javascript
// Check console messages for errors
const messages = await page.evaluate(() => 
  window.console.messages || []
);

// Take screenshot for visual debugging
await page.screenshot({ path: 'debug.png' });
```

### Drag and Drop Fix Example

During development, we discovered that drag and drop wasn't working due to a mismatch between `effectAllowed` and `dropEffect`:

**Problem**: 
- Drag source: `effectAllowed = 'copy'`
- Drop target: `dropEffect = 'move'`

**Solution**:
```typescript
// In handleDragOver
e.dataTransfer.dropEffect = 'copy'; // Changed from 'move'
```

**Testing Process**:
1. Used Playwright to drag blocks from palette
2. Observed that dragstart fired but drop didn't
3. Added debug logging to identify the issue
4. Fixed the dropEffect mismatch
5. Verified fix with Playwright drag tests

### Best Practices

#### Element Selection
- Use `getByText()` for readable element selection
- Use `ref` attributes from snapshots for precise targeting
- Take fresh snapshots after page changes (hot reload resets refs)

#### Error Handling
- Always check console messages for JavaScript errors
- Use try-catch blocks for Playwright operations
- Take screenshots when tests fail for debugging

#### Test Isolation
- Start each test with a fresh page state
- Clean up browser sessions after testing
- Stop dev server processes when done

#### Debugging Tips
- Add temporary console.log statements to track events
- Use browser developer tools alongside Playwright
- Test both click and drag interactions separately
- Verify that hot reload doesn't interfere with tests

### Example Test Session

```javascript
// 1. Start dev server (in terminal)
// npm run dev

// 2. Navigate and test
await page.goto('http://localhost:3001');
await page.screenshot(); // Initial state

// 3. Test clicking (should work)
await page.getByText('when green flag clicked').click();
await page.screenshot(); // Verify block added

// 4. Test dragging (main functionality)
await page.getByText('say').dragTo(page.getByText('program area'));
await page.screenshot(); // Verify drag worked

// 5. Check for errors
const messages = await page.evaluate(() => console.messages);
console.log('Console messages:', messages);

// 6. Clean up
await page.close();
```

This approach allows for comprehensive testing of the visual programming interface, especially for complex interactions like drag-and-drop that are difficult to test with traditional unit tests.