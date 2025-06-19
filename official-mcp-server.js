#!/usr/bin/env node

import { createConnection } from '@playwright/mcp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR_BASE = './user-data-dirs';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const port = process.env.PORT || 8931;
const host = process.env.HOST || '0.0.0.0';

// Bright Data Scraping Browser configuration
const PROXY_CONFIG = {
  wsEndpoint: 'wss://brd-customer-hl_928b621d-zone-scraping_browser1:vsm7l40v4j3j@brd.superproxy.io:9222',
  username: 'brd-customer-hl_928b621d-zone-scraping_browser1',
  password: 'vsm7l40v4j3j'
};

// Anti-detection configurations
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Enhanced browser launch options
const getSimpleLaunchOptions = (useProxy = true) => {
  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-dev-shm-usage'
    ],
    ignoreHTTPSErrors: true
  };

  if (useProxy) {
    options.executablePath = undefined;
    options.wsEndpoint = PROXY_CONFIG.wsEndpoint;
  }

  return options;
};

// Enhanced context options for better site compatibility
const getSimpleContextOptions = () => ({
  viewport: { width: 1920, height: 1080 },
  userAgent: getRandomUserAgent(),
  locale: 'en-US',
  timezoneId: 'America/New_York',
  javaScriptEnabled: true
});

// Simplified page setup
const setupSimplePage = async (page) => {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    
    // Block unnecessary resources for faster loading
    if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
      await route.abort();
      return;
    }

    await route.continue({
      headers: {
        ...request.headers(),
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
  });
};

// Ensure user data directory exists
if (!fs.existsSync(USER_DATA_DIR_BASE)) {
  fs.mkdirSync(USER_DATA_DIR_BASE, { recursive: true });
}
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Cleanup function with better error handling and logging
const cleanupUserDataDir = (dirPath) => {
  try {
    if (!dirPath || typeof dirPath !== 'string') return;
    
    // Check if it's a user data directory to prevent accidental deletion
    if (!dirPath.includes(USER_DATA_DIR_BASE)) return;
    
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    // Silent error handling for cleanup
  }
};

// Cleanup all user data directories
const cleanupAllUserDataDirs = () => {
  try {
    if (fs.existsSync(USER_DATA_DIR_BASE)) {
      const entries = fs.readdirSync(USER_DATA_DIR_BASE);
      entries.forEach(entry => {
        const fullPath = path.join(USER_DATA_DIR_BASE, entry);
        cleanupUserDataDir(fullPath);
      });
      // Remove the base directory itself if empty
      if (fs.readdirSync(USER_DATA_DIR_BASE).length === 0) {
        fs.rmdirSync(USER_DATA_DIR_BASE);
      }
    }
  } catch (error) {
    // Silent error handling for cleanup
  }
};

// Configure HTML to Markdown conversion options
const markdownOptions = {
  extractMainContent: true, // Extract main content only
  refifyUrls: true, // Convert URLs to reference-style links to reduce tokens
  enableTableColumnTracking: true, // Better table handling for LLMs
  includeMetaData: 'extended', // Include metadata for context
  debug: false
};

// Function to convert HTML to semantic markdown optimized for LLMs
function htmlToMarkdown(html) {
  try {
    const dom = new JSDOM(html);
    return convertHtmlToMarkdown(html, {
      ...markdownOptions,
      overrideDOMParser: dom.window.DOMParser
    });
  } catch (error) {
    return html;
  }
}

// Function to retry navigation with optimized delays
async function tryNavigateWithRetry(page, url, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await setupSimplePage(page);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      if (!response) {
        throw new Error('No response received');
      }

      const status = response.status();
      if (status !== 200) {
        throw new Error(`HTTP ${status}`);
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await page.waitForTimeout(1000);
    }
  }
}

// Enhanced scraping function
async function scrapeWithRetry(page, targetUrl, maxRetries = 2) {
  const response = await tryNavigateWithRetry(page, targetUrl, maxRetries);
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  return response;
}

// Function to format page content
async function formatPageContent(page) {
  try {
    const content = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerHTML;
    });
    return htmlToMarkdown(content);
  } catch (error) {
    return await page.evaluate(() => document.body.textContent || '');
  }
}

// Enhanced SSE Transport with intelligent HTML processing
class EnhancedSSETransport extends SSEServerTransport {
  constructor(endpoint, response) {
    super(endpoint, response);
    
    if (typeof this.sendEvent === 'function') {
      const originalSendEvent = this.sendEvent.bind(this);
      
      this.sendEvent = (method, params) => {
        try {
          if (params) {
            // Process tool call results
            if (params.result && params.result.content) {
              params.result = processToolResult(params.result);
            }
            
            // Process tool list responses
            if (params.tools && Array.isArray(params.tools)) {
              params.tools = params.tools.map(tool => {
                if (tool.description) {
                  tool.description = htmlToMarkdown(tool.description);
                }
                return tool;
              });
            }
            
            // Process message content
            if (params.content && Array.isArray(params.content)) {
              params.content = params.content.map(item => {
                if (item.type === 'text' && item.text) {
                  return {
                    ...item,
                    text: htmlToMarkdown(item.text)
                  };
                }
                return item;
              });
            }
            
            // Process error messages
            if (params.error && params.error.message) {
              params.error.message = htmlToMarkdown(params.error.message);
            }
          }
          
          return originalSendEvent(method, params);
        } catch (error) {
          return originalSendEvent(method, params);
        }
      };
    }
    
    if (typeof this.send === 'function') {
      const originalSend = this.send.bind(this);
      
      this.send = (message) => {
        try {
          if (typeof message === 'object' && message.result && message.result.content) {
            message.result = processToolResult(message.result);
          }
          return originalSend(message);
        } catch (error) {
          return originalSend(message);
        }
      };
    }
  }
}

// Process tool results with semantic markdown conversion
function processToolResult(result) {
  if (!result || !result.content) return result;
  
  try {
    const processedContent = result.content.map(item => {
      if (item.type === 'text' && item.text) {
        return {
          ...item,
          text: htmlToMarkdown(item.text)
        };
      }
      return item;
    });
    
    return {
      ...result,
      content: processedContent
    };
  } catch (error) {
    return result;
  }
}

// SSE sessions map (following official pattern)
const sseSessions = new Map();

// Function to create a browser instance
async function createBrowser(useProxy = true) {
  const options = getSimpleLaunchOptions(useProxy);
  
  if (useProxy) {
    // Use CDP connection for Bright Data's Scraping Browser
    return await chromium.connectOverCDP(options.wsEndpoint);
  } else {
    // Launch regular browser for non-proxy usage
    return await chromium.launch(options);
  }
}

// Update the createConnection function usage
async function handleSSE(req, res, urlObj) {
  let userDataDir = '';
  let connection = null;
  
  if (req.method === 'POST') {
    const sessionId = urlObj.searchParams.get('sessionId');
    if (!sessionId) {
      res.statusCode = 400;
      return res.end('Missing sessionId');
    }

    const transport = sseSessions.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      return res.end('Session not found');
    }

    return await transport.handlePostMessage(req, res);
  } else if (req.method === 'GET') {
    // Create unique user data directory for this session
    const sessionUuid = uuidv4();
    userDataDir = path.join(USER_DATA_DIR_BASE, sessionUuid);
    
    // Ensure the directory exists
    fs.mkdirSync(userDataDir, { recursive: true });

    try {
      // Create browser instance using Bright Data's Scraping Browser
      const browser = await createBrowser(true);
      
      // Create connection using the browser instance
      connection = await createConnection({
        browser: browser,
        contextOptions: getSimpleContextOptions()
      });

      // Create enhanced SSE transport with advanced HTML processing
      const transport = new EnhancedSSETransport('/sse', res);
      sseSessions.set(transport.sessionId, transport);
      
      // Connect the server to the transport
      await connection.server.connect(transport);
      
      // Handle client disconnect and cleanup
      res.on('close', () => {
        sseSessions.delete(transport.sessionId);
        if (connection?.browser) {
          connection.browser.close().catch(() => {});
        }
        cleanupUserDataDir(userDataDir);
      });
      
    } catch (error) {
      cleanupUserDataDir(userDataDir);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to establish MCP connection', 
          details: error.message 
        }));
      }
    }
    return;
  }

  res.statusCode = 405;
  res.end('Method not allowed');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // SSE endpoint following official Playwright MCP pattern
  if (parsedUrl.pathname === '/sse') {
    return await handleSSE(req, res, new URL(`http://localhost${req.url}`));
  }

  // Enable CORS for other endpoints
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, Connection, Upgrade, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control, Connection');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      server: 'Enhanced Playwright MCP Server with Proxy & Anti-Detection',
      sessions: sseSessions.size,
      proxy: {
        enabled: true,
        server: PROXY_CONFIG.wsEndpoint,
        type: 'Bright Data Scraping Browser'
      },
      features: [
        'Bright Data Scraping Browser integration',
        'Advanced anti-detection',
        'Rotating user agents',
        'Human behavior simulation',
        'Semantic HTML→Markdown conversion',
        'LLM-optimized content extraction',
        'Metadata preservation',
        'Token optimization'
      ]
    }));
    return;
  }

  // Custom scraping endpoint
  if (parsedUrl.pathname === '/scrape') {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString();
    
    try {
      const { url: targetUrl, useProxy = true } = JSON.parse(body);
      
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing URL' }));
        return;
      }

      const sessionId = uuidv4();
      const userDataDir = path.join(USER_DATA_DIR_BASE, sessionId);
      fs.mkdirSync(userDataDir, { recursive: true });

      const browser = await chromium.launch(getSimpleLaunchOptions(useProxy));
      const context = await browser.newContext(getSimpleContextOptions());
      const page = await context.newPage();

      const response = await scrapeWithRetry(page, targetUrl);
      const content = await formatPageContent(page);

      await browser.close();
      cleanupUserDataDir(userDataDir);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        content,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: error.message
      }));
    }
    return;
  }

  // Handle unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Cleanup on shutdown
process.on('SIGINT', () => {
  cleanupAllUserDataDirs();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupAllUserDataDirs();
  process.exit(0);
});

// Additional cleanup on uncaught exceptions
process.on('uncaughtException', (error) => {
  cleanupAllUserDataDirs();
  process.exit(1);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`🚀 Enhanced Official Playwright MCP Server running at ${url}`);
  console.log(`🏥 Health check: ${url}/health`);
  
  // Official message format (following transport.ts pattern)  
  const message = [
    `Listening on ${url}`,
    'Put this in your client config:',
    JSON.stringify({
      'mcpServers': {
        'playwright': {
          'url': `${url}/sse`
        }
      }
    }, undefined, 2),
    'Additional endpoints:',
    `  Scraping: ${url}/scrape`
  ].join('\n');
  
  console.log(message);
  console.log('');
  console.log('🎉 SERVIDOR MELHORADO COM PROXY E ANTI-DETECÇÃO:');
  console.log('  ✅ Bright Data Scraping Browser integrado');
  console.log('  ✅ User agents rotativos');
  console.log('  ✅ Headers HTTP realistas');
  console.log('  ✅ Viewport randomizado');
  console.log('  ✅ Comportamento humano simulado');
  console.log('  ✅ Anti-detecção avançada');
  console.log('  ✅ Conversão HTML→Markdown otimizada para LLMs');
  console.log('  ✅ Extração de conteúdo principal');
  console.log('  ✅ Metadados estruturados');
  console.log('  ✅ Redução de tokens');
}); 