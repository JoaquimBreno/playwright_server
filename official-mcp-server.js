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
    ignoreHTTPSErrors: true,
    timeout: 60000 
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
    
    console.log('Cleaning directory:', dirPath);
    if (fs.existsSync(dirPath)) {
      // Primeiro remove todo o conteúdo recursivamente
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log('Directory cleaned:', dirPath);
    }
  } catch (error) {
    console.error('Error cleaning directory:', dirPath, error);
  }
};

// Cleanup all user data directories
const cleanupAllUserDataDirs = () => {
  try {
    if (!fs.existsSync(USER_DATA_DIR_BASE)) return;

    console.log('Starting cleanup of all user data directories...');
    
    // Lista todos os diretórios
    const entries = fs.readdirSync(USER_DATA_DIR_BASE);
    console.log(`Found ${entries.length} directories to clean`);

    // Limpa cada diretório
    entries.forEach(entry => {
      const fullPath = path.join(USER_DATA_DIR_BASE, entry);
      cleanupUserDataDir(fullPath);
    });

    // Remove o diretório base
    try {
      fs.rmSync(USER_DATA_DIR_BASE, { recursive: true, force: true });
      console.log('Base directory removed:', USER_DATA_DIR_BASE);
    } catch (error) {
      console.error('Failed to remove base directory:', error);
    }

    // Recria o diretório base vazio
    fs.mkdirSync(USER_DATA_DIR_BASE, { recursive: true });
    console.log('Clean base directory created');
    
  } catch (error) {
    console.error('Error in cleanup process:', error);
    // Tenta uma última vez remover tudo forçadamente
    try {
      fs.rmSync(USER_DATA_DIR_BASE, { recursive: true, force: true });
      fs.mkdirSync(USER_DATA_DIR_BASE, { recursive: true });
    } catch (e) {
      console.error('Final cleanup attempt failed:', e);
    }
  }
};

// Configure HTML to Markdown conversion options
const markdownOptions = {
  extractMainContent: true,
  refifyUrls: true,
  enableTableColumnTracking: true,
  includeMetaData: 'extended',
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  removeComments: true,
  removeScript: true,
  removeStyle: true,
  debug: false
};

// Function to clean HTML before markdown conversion
function cleanHtml(html) {
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Remove scripts, styles, and other non-content elements
    const removeElements = ['script', 'style', 'iframe', 'noscript', 'meta', 'link'];
    removeElements.forEach(tag => {
      const elements = doc.getElementsByTagName(tag);
      while (elements.length > 0) elements[0].remove();
    });

    // Remove hidden elements
    doc.querySelectorAll('[style*="display: none"], [style*="visibility: hidden"], [hidden]').forEach(el => el.remove());

    // Remove empty elements except for specific tags
    const keepTags = ['p', 'div', 'span', 'br', 'hr'];
    doc.querySelectorAll('*').forEach(el => {
      if (!keepTags.includes(el.tagName.toLowerCase()) && !el.textContent.trim()) {
        el.remove();
      }
    });

    // Clean up attributes
    doc.querySelectorAll('*').forEach(el => {
      const keepAttrs = ['href', 'src', 'alt', 'title'];
      Array.from(el.attributes).forEach(attr => {
        if (!keepAttrs.includes(attr.name)) el.removeAttribute(attr.name);
      });
    });

    return doc.body.innerHTML;
  } catch (error) {
    return html;
  }
}

// Enhanced HTML to Markdown conversion
function htmlToMarkdown(html) {
  try {
    const cleanedHtml = cleanHtml(html);
    const dom = new JSDOM(cleanedHtml);
    return convertHtmlToMarkdown(cleanedHtml, {
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

// Enhanced SSE Transport with improved HTML processing
class EnhancedSSETransport extends SSEServerTransport {
  constructor(endpoint, response) {
    super(endpoint, response);
    
    if (typeof this.sendEvent === 'function') {
      const originalSendEvent = this.sendEvent.bind(this);
      
      this.sendEvent = (method, params) => {
        try {
          if (params) {
            params = this.processParams(params);
          }
          return originalSendEvent(method, params);
        } catch (error) {
          return originalSendEvent(method, params);
        }
      };
    }
  }

  // Process parameters recursively
  processParams(params) {
    if (!params) return params;

    // Handle arrays
    if (Array.isArray(params)) {
      return params.map(item => this.processParams(item));
    }

    // Handle objects
    if (typeof params === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(params)) {
        processed[key] = this.processParams(value);
      }
      return processed;
    }

    // Handle HTML content
    if (typeof params === 'string' && params.includes('<')) {
      return htmlToMarkdown(params);
    }

    return params;
  }
}

// Process tool results with enhanced markdown conversion
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
      if (item.type === 'html') {
        return {
          type: 'text',
          text: htmlToMarkdown(item.html || '')
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
    return await chromium.connectOverCDP(options.wsEndpoint);
  }
  return await chromium.launch(options);
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
    const sessionUuid = uuidv4();
    userDataDir = path.join(USER_DATA_DIR_BASE, sessionUuid);
    fs.mkdirSync(userDataDir, { recursive: true });
    try {
      // Create connection using official Playwright MCP with proxy
      connection = await createConnection({
        browser: {
          browserName: 'chromium',
          userDataDir: userDataDir,
          launchOptions: getSimpleLaunchOptions(true),
          contextOptions: getSimpleContextOptions()
        }
      });

      const transport = new EnhancedSSETransport('/sse', res);
      sseSessions.set(transport.sessionId, transport);
      
      await connection.server.connect(transport);
      
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

// Ensure cleanup on process exit
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT signal');
  cleanupAllUserDataDirs();
  console.log('Cleanup complete, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM signal');
  cleanupAllUserDataDirs();
  console.log('Cleanup complete, exiting...');
  process.exit(0);
});

// Additional cleanup on uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\nUncaught exception:', error);
  cleanupAllUserDataDirs();
  console.log('Cleanup complete, exiting...');
  process.exit(1);
});

// Cleanup on process exit
process.on('exit', () => {
  console.log('\nProcess exiting, final cleanup...');
  try {
    // Última tentativa de limpeza síncrona
    if (fs.existsSync(USER_DATA_DIR_BASE)) {
      fs.rmSync(USER_DATA_DIR_BASE, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('Final cleanup error:', error);
  }
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