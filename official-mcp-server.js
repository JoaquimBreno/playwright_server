#!/usr/bin/env node

import 'dotenv/config';
import { createConnection } from '@playwright/mcp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import TurndownService from 'turndown';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Browser configuration optimized for Docker containers

const USER_DATA_DIR_BASE = './user-data-dirs';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const port = process.env.PORT || 8931;
const host = process.env.HOST || '0.0.0.0';

// Global browser instance for performance
let globalBrowser = null;
const BROWSER_IDLE_TIMEOUT = 300000; // Close browser after 5 minutes of inactivity
let browserIdleTimer = null;

// Performance optimizations
const FAST_TIMEOUT = 10000; // Reduced from 30s to 10s
const MAX_RETRIES = 1; // Reduced from 2 to 1
const BROWSER_LOCK_TIMEOUT = 30000; // 30 seconds lock timeout

// Browser lock mechanism
let browserLock = false;
let browserLockTimeout = null;

// Function to acquire browser lock
const acquireBrowserLock = async () => {
  const startTime = Date.now();
  while (browserLock) {
    if (Date.now() - startTime > BROWSER_LOCK_TIMEOUT) {
      throw new Error('Failed to acquire browser lock - timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browserLock = true;
  if (browserLockTimeout) {
    clearTimeout(browserLockTimeout);
  }
  browserLockTimeout = setTimeout(() => {
    console.log('🔓 Forcing browser lock release due to timeout');
    browserLock = false;
  }, BROWSER_LOCK_TIMEOUT);
};

// Function to release browser lock
const releaseBrowserLock = () => {
  browserLock = false;
  if (browserLockTimeout) {
    clearTimeout(browserLockTimeout);
    browserLockTimeout = null;
  }
};

// Bright Data Scraping Browser configuration
const PROXY_CONFIG = {
  wsEndpoint: process.env.PROXY_WS_ENDPOINT || '',
  username: process.env.PROXY_USERNAME || '',
  password: process.env.PROXY_PASSWORD || ''
};

// Validate proxy configuration
function isProxyConfigured() {
  const hasAllConfig = PROXY_CONFIG.wsEndpoint && PROXY_CONFIG.username && PROXY_CONFIG.password;
  if (!hasAllConfig) {
    console.log('⚠️ Configuração de proxy incompleta:');
    if (!PROXY_CONFIG.wsEndpoint) console.log('  - PROXY_WS_ENDPOINT não configurado');
    if (!PROXY_CONFIG.username) console.log('  - PROXY_USERNAME não configurado');
    if (!PROXY_CONFIG.password) console.log('  - PROXY_PASSWORD não configurado');
    return false;
  }
  return true;
}

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

// Simplified context options optimized for Docker containers
const getSimpleContextOptions = () => ({
  viewport: { 
    width: 1920, 
    height: 1080 
  },
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-US',
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  javaScriptEnabled: true,
  ignoreHTTPSErrors: true,
  bypassCSP: true,
  extraHTTPHeaders: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

// Enhanced browser launch options optimized for Docker containers
const getSimpleLaunchOptions = (useProxy = true) => {
  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-extensions',
      '--disable-default-apps',
      '--no-first-run',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--window-size=1920,1080'
    ],
    ignoreHTTPSErrors: true,
    timeout: FAST_TIMEOUT,
    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection']
  };

  if (useProxy && isProxyConfigured()) {
    console.log('🔌 Iniciando com proxy...');
    options.executablePath = undefined;
    options.wsEndpoint = PROXY_CONFIG.wsEndpoint;
  } else {
    if (useProxy) {
      console.log('⚠️ Iniciando sem proxy - usando Chromium embutido');
    }
    // Use built-in Chromium in Docker containers
    options.executablePath = undefined;
  }

  return options;
};

// Global browser management for performance
const getGlobalBrowser = async (useProxy = true) => {
  try {
    await acquireBrowserLock();
    
    if (globalBrowser) {
      try {
        // Test if browser is still responsive
        await globalBrowser.contexts();
      } catch (error) {
        console.log('🔄 Browser não responsivo, reiniciando...');
        await closeGlobalBrowser();
      }
    }
    
    if (!globalBrowser) {
      console.log('🚀 Criando nova instância do browser...');
      globalBrowser = await chromium.launch(getSimpleLaunchOptions(useProxy));
      console.log('✅ Browser global criado');
    }
    
    // Reset idle timer
    if (browserIdleTimer) {
      clearTimeout(browserIdleTimer);
    }
    
    browserIdleTimer = setTimeout(async () => {
      console.log('⏰ Fechando browser por inatividade...');
      await closeGlobalBrowser();
    }, BROWSER_IDLE_TIMEOUT);
    
    return globalBrowser;
  } finally {
    releaseBrowserLock();
  }
};

const closeGlobalBrowser = async () => {
  try {
    await acquireBrowserLock();
    
    if (browserIdleTimer) {
      clearTimeout(browserIdleTimer);
      browserIdleTimer = null;
    }
    
    if (globalBrowser) {
      console.log('🔚 Fechando browser global...');
      await globalBrowser.close().catch(error => {
        console.log('Erro ao fechar browser:', error.message);
      });
      globalBrowser = null;
    }
  } finally {
    releaseBrowserLock();
  }
};

// Ultra-fast page setup for performance
const setupFastPage = async (page) => {
  // Minimal anti-detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Block only heavy resources for maximum speed
  await page.route('**/*', async (route) => {
    const resourceType = route.request().resourceType();
    
    if (['image', 'media'].includes(resourceType)) {
      await route.abort();
      return;
    }

    await route.continue();
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

// Initialize Turndown with custom options
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  linkStyle: 'referenced',
  linkReferenceStyle: 'collapsed'
});

// Fast navigation with minimal retries
async function fastNavigate(page, targetUrl) {
  console.log(`🚀 Navegação rápida para: ${targetUrl}`);
      
  await setupFastPage(page);
  
      const response = await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
    timeout: FAST_TIMEOUT
      });

      if (!response) {
        throw new Error('Sem resposta do servidor');
      }

      const status = response.status();
      console.log(`📊 Status: ${status}`);

  if (status >= 400) {
    throw new Error(`HTTP ${status}`);
  }

      return response;
}

// Optimized scraping with retry only on failure
async function scrapeWithMinimalRetry(page, targetUrl) {
  try {
    return await fastNavigate(page, targetUrl);
    } catch (error) {
    console.log(`⚠️ Primeira tentativa falhou, tentando novamente: ${error.message}`);
    // One retry with fresh page
    await page.reload({ waitUntil: 'domcontentloaded', timeout: FAST_TIMEOUT });
    return await fastNavigate(page, targetUrl);
  }
}

// Fast content formatting with minimal processing
async function fastFormatContent(page) {
  try {
    // Get clean text content directly
    const { title, content, textLength } = await page.evaluate(() => {
      // Quick cleanup of major noise
      ['script', 'style', 'noscript'].forEach(tag => {
        document.querySelectorAll(tag).forEach(el => el.remove());
      });

      // Get main content area
      const main = document.querySelector('main, article, [role="main"], #main, .main-content') || document.body;
      
      return {
        title: document.title,
        content: main.innerText || main.textContent || '',
        textLength: (main.innerText || main.textContent || '').length
      };
    });

    // Simple cleanup without heavy regex processing
    const cleanContent = content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Skip markdown conversion for performance - return clean text
    return cleanContent;
  } catch (error) {
    console.error('Error in fastFormatContent:', error);
    // Ultra-fast fallback
    const textContent = await page.evaluate(() => document.body.textContent || '');
    return textContent.replace(/\s+/g, ' ').trim();
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
      return formatPageContent(params);
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
          text: formatPageContent(item.text)
        };
      }
      if (item.type === 'html') {
        return {
          type: 'text',
          text: formatPageContent(item.html || '')
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

// Function to get browser type for MCP
function getMCPBrowserConfig() {
  const useProxy = isProxyConfigured();
  // For persistent context, we need to use a specific configuration
  const persistentContextConfig = {
    browserName: 'chromium', // Always use chromium for persistent context
    userDataDir: path.join(USER_DATA_DIR_BASE, uuidv4()),
    launchOptions: {
      ...getSimpleLaunchOptions(useProxy),
      // Use built-in Chromium for Docker containers
      executablePath: undefined
    },
    contextOptions: getSimpleContextOptions()
  };

  return persistentContextConfig;
}

// Ensure browser is installed
async function ensureBrowserInstalled() {
  console.log('Checking browser setup...');
  
  try {
    // Test browser launch with Docker-optimized settings
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ]
    });
    
    await browser.close();
    console.log('✅ Browser setup successful with built-in Chromium!');
    
    // Store browser info globally
    global.defaultBrowser = chromium;
    global.defaultBrowserName = 'chromium';
    
    return;
  } catch (error) {
    console.error('❌ Browser setup failed:', error);
    throw error;
  }
}

// Update handleSSE function
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
    console.log('\n🔄 Nova sessão iniciando...');
    const sessionUuid = uuidv4();
    userDataDir = path.join(USER_DATA_DIR_BASE, sessionUuid);
    fs.mkdirSync(userDataDir, { recursive: true });
    
    try {
      console.log('🔌 Estabelecendo conexão...');
      connection = await createConnection({
        browser: getMCPBrowserConfig()
      });
      console.log('✅ Conexão estabelecida');

      const transport = new EnhancedSSETransport('/sse', res);
      sseSessions.set(transport.sessionId, transport);
      
      await connection.server.connect(transport);
      console.log('✅ Servidor conectado');
      
      res.on('close', () => {
        console.log('\n🔚 Finalizando sessão...');
        sseSessions.delete(transport.sessionId);
        if (connection?.browser) {
          connection.browser.close().catch(() => {});
        }
        cleanupUserDataDir(userDataDir);
        console.log('✅ Sessão finalizada');
      });
      
    } catch (error) {
      console.error('❌ Erro na conexão:', error);
      cleanupUserDataDir(userDataDir);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to establish connection', 
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
      
      // Validate URL
      if (!targetUrl || typeof targetUrl !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false,
          error: 'Missing or invalid URL. URL must be a non-empty string.',
          timestamp: new Date().toISOString()
        }, null, 2));
        return;
      }

      // Try to parse and validate URL
      try {
        const urlObj = new URL(targetUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          throw new Error('Invalid URL protocol. Only HTTP and HTTPS are supported.');
        }
      } catch (urlError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false,
          error: `Invalid URL: ${urlError.message}`,
          timestamp: new Date().toISOString()
        }, null, 2));
        return;
      }

      console.time('scrape-total');

      // Use global browser for performance
      const browser = await getGlobalBrowser(useProxy);
      const context = await browser.newContext(getSimpleContextOptions());
      
      console.time('scrape-page-creation');
      const page = await context.newPage();
      console.timeEnd('scrape-page-creation');

      console.time('scrape-navigation');
      const response = await scrapeWithMinimalRetry(page, targetUrl);
      console.timeEnd('scrape-navigation');
      
      console.time('scrape-content-extraction');
      // Get metadata and content in parallel
      const [metadata, content] = await Promise.all([
        page.evaluate(() => {
        const getMetaContent = (name) => {
          const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return meta ? meta.getAttribute('content') : null;
        };
        
        return {
          title: document.title,
          description: getMetaContent('description') || getMetaContent('og:description'),
          keywords: getMetaContent('keywords'),
          author: getMetaContent('author') || getMetaContent('og:site_name'),
          url: window.location.href,
          lastModified: document.lastModified
        };
        }),
        fastFormatContent(page)
      ]);
      console.timeEnd('scrape-content-extraction');

      // Close context but keep browser alive
      await context.close();
      
      // Async cleanup (non-blocking)
      const sessionId = uuidv4();
      const userDataDir = path.join(USER_DATA_DIR_BASE, sessionId);
      setImmediate(() => {
        fs.mkdirSync(userDataDir, { recursive: true });
      cleanupUserDataDir(userDataDir);
      });

      console.timeEnd('scrape-total');

      const result = {
        success: true,
        metadata,
        content,
        format: 'text', // Changed from markdown for performance
        timestamp: new Date().toISOString(),
        stats: {
          contentLength: content.length,
          approximateWordCount: content.split(/\s+/).length,
          statusCode: response.status(),
          headers: response.headers()
        },
        performance: {
          optimized: true,
          browserReused: globalBrowser !== null,
          fastMode: true
        }
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));

    } catch (error) {
      console.error('Error in scrape endpoint:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    return;
  }

  // Handle unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Ensure cleanup on process exit
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT signal');
  await closeGlobalBrowser();
  cleanupAllUserDataDirs();
  console.log('Cleanup complete, exiting...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM signal');
  await closeGlobalBrowser();
  cleanupAllUserDataDirs();
  console.log('Cleanup complete, exiting...');
  process.exit(0);
});

// Additional cleanup on uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('\nUncaught exception:', error);
  await closeGlobalBrowser();
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

server.listen(port, host, async () => {
  try {
    await ensureBrowserInstalled();
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
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}); 