#!/bin/bash

# Start Official Playwright MCP Server
echo "Starting Official Playwright MCP Server..."

# Kill any existing MCP servers
pkill -f "@playwright/mcp" 2>/dev/null || true
pkill -f "official-mcp-server.js" 2>/dev/null || true

# Wait a moment
sleep 2

# Start the official Playwright MCP server with SSE transport
npx @playwright/mcp \
  --port 8931 \
  --host 0.0.0.0 \
  --headless \
  --no-sandbox \
  --ignore-https-errors \
  --user-data-dir ./user-data-dirs/official \
  --output-dir ./output \
  --caps tabs,pdf,history,wait,files \
  --allowed-origins "*" 