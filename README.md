# Playwright MCP Server

A standalone server implementation using the official [Playwright MCP](https://github.com/microsoft/playwright-mcp) (Multi-Client Protocol) package.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running the Server

You have several options to start the server:

1. Standard mode (with UI):
```bash
npm start
```

2. Vision mode (uses screenshots instead of accessibility snapshots):
```bash
npm run start:vision
```

3. Headless mode (no browser UI):
```bash
npm run start:headless
```

The server will run on http://localhost:8931 by default.

## Client Configuration

To connect to this server, use the following configuration in your MCP client:

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/sse"
    }
  }
}
```

## Features

The MCP server provides a comprehensive set of browser automation capabilities:

- Browser Control: Navigate, refresh, go back/forward
- Page Interaction: Click, type, hover, drag-and-drop
- Resource Management: Handle multiple tabs, take screenshots, save PDFs
- Network Monitoring: Track requests, console messages
- Dialog Handling: Handle alerts, prompts, and confirmations
- File Operations: Upload files, download resources
- Visual Testing: Take screenshots, compare visual states

## Server Modes

1. **Standard Mode** (default)
   - Shows browser UI
   - Uses accessibility snapshots for better performance
   - Best for development and debugging

2. **Vision Mode**
   - Uses screenshots for visual-based interactions
   - Better for visual automation tasks
   - Enable with `npm run start:vision`

3. **Headless Mode**
   - Runs browser without UI
   - Best for production/server environments
   - Enable with `npm run start:headless`

## Additional Configuration

The server supports various command line arguments for customization:

- `--browser`: Specify browser (chrome, firefox, webkit)
- `--viewport-size`: Set browser viewport size
- `--user-agent`: Custom user agent
- `--ignore-https-errors`: Ignore HTTPS errors
- `--device`: Emulate specific device
- And more (run `npx @playwright/mcp@latest --help` for full list)

## Cloudflare Tunnel Setup

To expose the server securely through Cloudflare:

1. Install cloudflared:
   ```bash
   # macOS (using Homebrew)
   brew install cloudflare/cloudflare/cloudflared
   
   # Or download from Cloudflare's website
   # https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
   ```

2. Authenticate with Cloudflare:
   ```bash
   cloudflared tunnel login
   ```

3. Create a tunnel:
   ```bash
   cloudflared tunnel create playwright-mcp
   ```

4. Update the `config.yml` file with your tunnel details:
   - Replace `your-tunnel-name` with your tunnel ID
   - Replace `your-subdomain.your-domain.com` with your domain

5. Start the tunnel:
   ```bash
   cloudflared tunnel run playwright-mcp
   ```

Your server will be available at `https://your-subdomain.your-domain.com`

## Configuration

The server configuration in `server.js` includes:

- Port selection (default: 9999)
- Browser selection (chromium/firefox/webkit)
- Security settings (CORS origins)
- Headless mode configuration

## Security Note

The current configuration allows all origins (`*`) to connect to the server. For production use, you should:
1. Restrict allowed origins by modifying the `allowedOrigins` array in the configuration
2. Use Cloudflare Access policies to control who can connect to your tunnel
3. Enable Cloudflare Zero Trust features for additional security

## API Endpoints

### Navigate to URL
- **POST** `/navigate`
- Body: `{ "url": "https://example.com" }`

### Get Page Content
- **GET** `/content`
- Returns the current page HTML content

### Take Screenshot
- **GET** `/screenshot`
- Returns a PNG image of the current page

## Example Usage

```bash
# Navigate to a URL
curl -X POST http://localhost:9999/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Get page content
curl http://localhost:9999/content

# Take screenshot (saves to screenshot.png)
curl http://localhost:9999/screenshot --output screenshot.png
``` 