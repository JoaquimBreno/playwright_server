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
  wsEndpoint: process.env.PROXY_WS_ENDPOINT ,
  username: process.env.PROXY_USERNAME ,
  password: process.env.PROXY_PASSWORD 
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

// Enhanced context options for better site compatibility and anti-detection
const getSimpleContextOptions = () => ({
  viewport: { 
    width: 1920 + Math.floor(Math.random() * 100), 
    height: 1080 + Math.floor(Math.random() * 100) 
  },
  userAgent: getRandomUserAgent(),
  locale: 'en-US',
  timezoneId: 'America/New_York',
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  javaScriptEnabled: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 40.7128, longitude: -74.0060 }, // New York coordinates
  colorScheme: 'light',
  bypassCSP: true,
  extraHTTPHeaders: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  }
});

// Enhanced browser launch options with additional stealth configurations
const getSimpleLaunchOptions = (useProxy = true) => {
  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-notifications',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1920,1080'
    ],
    ignoreHTTPSErrors: true,
    timeout: 60000,
    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection']
  };

  if (useProxy) {
    console.log('🔌 Iniciando com proxy...');
    options.executablePath = undefined;
    options.wsEndpoint = PROXY_CONFIG.wsEndpoint;
  } else {
    console.log('⚠️ Iniciando sem proxy');
  }

  return options;
};

// Enhanced page setup with stealth configurations
const setupSimplePage = async (page) => {
  // Inject anti-detection scripts
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Fake web GL
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) {
        return 'Intel Inc.';
      }
      if (parameter === 37446) {
        return 'Intel Iris OpenGL Engine';
      }
      return getParameter.apply(this, [parameter]);
    };
  });

  // Set custom headers per request
  await page.route('**/*', async (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    
    // Block unnecessary resources for faster loading
    if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
      await route.abort();
      return;
    }

    // Add random delay between requests to look more human-like
    await page.waitForTimeout(Math.random() * 500);

    await route.continue({
      headers: {
        ...request.headers(),
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': getRandomUserAgent(),
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
  });

  // Add random mouse movements and scrolling to simulate human behavior
  await page.evaluate(() => {
    const randomScroll = () => {
      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0
      );
      const position = Math.random() * maxScroll;
      window.scrollTo(0, position);
    };
    
    setInterval(randomScroll, 5000 + Math.random() * 5000);
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
      await page.waitForTimeout(1000 * attempt); // Exponential backoff
    }
  }
}

// Enhanced scraping function with detailed logging
async function scrapeWithRetry(page, targetUrl, maxRetries = 2) {
  console.log(`�� Iniciando scraping: ${targetUrl}`);
  console.log(`📡 Status: ${page.context()._options?.proxy ? 'Proxy Ativo' : 'Conexão Direta'}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n🔄 Tentativa ${attempt} de ${maxRetries}`);
      
      await setupSimplePage(page);
      console.log('✅ Página configurada');

      console.log('🌐 Navegando...');
      const response = await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      if (!response) {
        throw new Error('Sem resposta do servidor');
      }

      const status = response.status();
      console.log(`📊 Status: ${status}`);

      return response;
    } catch (error) {
      console.error(`❌ Erro na tentativa ${attempt}`);
      if (attempt === maxRetries) throw error;
      console.log(`⏳ Aguardando próxima tentativa...`);
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

// Function to format page content
async function formatPageContent(page) {
  try {
    // Get the main content
    const content = await page.evaluate(() => {
      // Remove unwanted elements that might add noise
      const unwanted = [
        'script',
        'style',
        'noscript',
        'iframe',
        'frame',
        'object',
        'embed',
        'canvas',
        'video',
        'audio',
        'svg',
        '[aria-hidden="true"]',
        '[style*="display: none"]',
        '[hidden]'
      ];
      
      unwanted.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Get the content
      const mainContent = document.querySelector('main, article, [role="main"], #main, .main-content') || document.body;
      return mainContent.innerHTML;
    });

    // Convert HTML to Markdown
    let markdown = turndownService.turndown(content);

    // Clean up the markdown
    markdown = markdown
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Fix list items that might have been broken
      .replace(/^\s*[-*+]\s*$/gm, '')
      // Fix headers that might have extra spaces
      .replace(/^(#{1,6})\s+/gm, '$1 ')
      // Remove any remaining HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Fix any broken links
      .replace(/\[([^\]]*)\]\(\s*\)/g, '$1')
      // Remove any remaining HTML entities
      .replace(/&[a-z]+;/g, ' ')
      // Fix multiple spaces
      .replace(/\s+/g, ' ')
      // Fix multiple newlines again
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return markdown;
  } catch (error) {
    console.error('Error in formatPageContent:', error);
    // Fallback to plain text
    const plainText = await page.evaluate(() => document.body.textContent || '');
    return plainText.trim().replace(/\s+/g, ' ');
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

// Function to create a browser instance with enhanced logging
async function createBrowser(useProxy = true) {
  console.log('🌐 Iniciando browser...');
  try {
    const options = getSimpleLaunchOptions(useProxy);
    
    if (useProxy) {
      console.log('🔄 Conectando ao browser remoto...');
      const browser = await chromium.connectOverCDP(options.wsEndpoint);
      console.log('✅ Conexão remota estabelecida');
      return browser;
    } else {
      console.log('🔄 Iniciando browser local...');
      const browser = await chromium.launch(options);
      console.log('✅ Browser local iniciado');
      return browser;
    }
  } catch (error) {
    console.error('❌ Erro ao criar browser');
    throw error;
  }
}

// Update the handleSSE function with minimal logging
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
        browser: {
          browserName: 'chromium',
          userDataDir: userDataDir,
          launchOptions: getSimpleLaunchOptions(true),
          contextOptions: getSimpleContextOptions()
        }
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
      console.error('❌ Erro na conexão');
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

      const sessionId = uuidv4();
      const userDataDir = path.join(USER_DATA_DIR_BASE, sessionId);
      fs.mkdirSync(userDataDir, { recursive: true });

      const browser = await chromium.launch(getSimpleLaunchOptions(useProxy));
      const context = await browser.newContext(getSimpleContextOptions());
      const page = await context.newPage();

      const response = await scrapeWithRetry(page, targetUrl);
      
      // Get metadata
      const metadata = await page.evaluate(() => {
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
      });

      const content = await formatPageContent(page);

      await browser.close();
      cleanupUserDataDir(userDataDir);

      const result = {
        success: true,
        metadata,
        content,
        format: 'markdown',
        timestamp: new Date().toISOString(),
        stats: {
          contentLength: content.length,
          approximateWordCount: content.split(/\s+/).length,
          statusCode: response.status(),
          headers: response.headers()
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