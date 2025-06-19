import { createConnection } from '@playwright/mcp';
import { chromium } from 'playwright';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import url from 'url';
import TurndownService from 'turndown';

const port = process.env.PORT || 8931;
const USER_DATA_DIR_BASE = './user-data-dirs';
const DEFAULT_TIMEOUT = 300000; // 5 minutes

// Ensure base directory exists
if (!fs.existsSync(USER_DATA_DIR_BASE)) {
  fs.mkdirSync(USER_DATA_DIR_BASE);
}

// Clean up function for user data directories
const cleanupUserDataDir = (dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Failed to cleanup directory ${dirPath}:`, error);
  }
};

// Function to convert HTML to Markdown like crawl4ai
async function formatPageContent(page) {
  try {
    // Get the full HTML content
    const html = await page.content();
    
    // Configure Turndown service
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full'
    });
    
    // Add custom rules to preserve more content
    turndownService.addRule('preserveImages', {
      filter: 'img',
      replacement: function (content, node) {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        const title = node.getAttribute('title') || '';
        return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
      }
    });
    
    // Keep buttons and form elements as text
    turndownService.addRule('buttons', {
      filter: ['button', 'input'],
      replacement: function (content, node) {
        const type = node.getAttribute('type') || '';
        const value = node.getAttribute('value') || '';
        const text = node.textContent || value;
        return text ? `[${text}]` : '';
      }
    });
    
    // Remove only scripts, styles and comments
    const cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    
    // Convert to markdown
    const markdown = turndownService.turndown(cleanHtml);
    
    // Basic cleanup - remove excessive whitespace but preserve structure
    const cleanMarkdown = markdown
      .replace(/\n{4,}/g, '\n\n\n')  // Max 3 consecutive newlines
      .replace(/[ \t]+$/gm, '')      // Remove trailing spaces
      .replace(/^[ \t]+/gm, '')      // Remove leading spaces (but preserve list indentation)
      .trim();
    
    console.log(`Converted HTML to Markdown: ${cleanMarkdown.length} characters`);
    
    return cleanMarkdown;
    
  } catch (error) {
    console.error('Error in formatPageContent:', error);
    
    // Fallback: simple text extraction
    try {
      const simpleText = await page.evaluate(() => {
        return document.body.textContent || document.documentElement.textContent || '';
      });
      return simpleText.replace(/\s+/g, ' ').trim();
    } catch (e) {
      return 'Error extracting content';
    }
  }
}

// Function to retry an async operation
async function retry(operation, maxAttempts = 3, delay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Tentativa ${attempt} de ${maxAttempts}...`);
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(`Tentativa ${attempt} falhou:`, error.message);
      
      if (attempt < maxAttempts) {
        console.log(`Aguardando ${delay/1000} segundos antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// Function to create browser context with proxy configuration
async function createBrowserWithProxy(proxy = null) {
  const userDataDir = path.join(USER_DATA_DIR_BASE, uuidv4());
  
  let launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
      '--ignore-certificate-errors-spki-list',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--no-first-run',
      '--disable-default-apps',
      // Anti-detection args
      '--disable-plugins-discovery',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-ipc-flooding-protection',
      '--enable-features=NetworkService,NetworkServiceLogging',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--use-mock-keychain'
    ],
    ignoreHTTPSErrors: true,
    timeout: 60000
  };
  
  let contextOptions = {
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1'
    }
  };
  
  // Add proxy configuration if provided
  if (proxy) {
    console.log(`Setting up proxy: ${proxy}`);
    
    // Parse proxy string: username:password@host:port
    const proxyMatch = proxy.match(/^(.+):(.+)@(.+):(\d+)$/);
    if (proxyMatch) {
      const [, username, password, host, port] = proxyMatch;
      
      // Try different proxy configurations for Bright Data
      const proxyConfigs = [
        // HTTP proxy
        {
          server: `http://${host}:${port}`,
          username: username,
          password: password
        },
        // HTTPS proxy  
        {
          server: `https://${host}:${port}`,
          username: username,
          password: password
        }
      ];
      
      // Use the first config (HTTP)
      launchOptions.proxy = proxyConfigs[0];
      
      console.log(`Proxy configured: ${launchOptions.proxy.server} with user: ${username}`);
      
      // Add proxy args to browser
      launchOptions.args.push(
        `--proxy-server=${launchOptions.proxy.server}`,
        '--proxy-bypass-list=<-loopback>'
      );
      
    } else {
      console.error('Invalid proxy format. Expected: username:password@host:port');
      throw new Error('Invalid proxy format');
    }
  }
  
  console.log('Launching browser with options:', {
    proxy: launchOptions.proxy ? 'configured' : 'none',
    args: launchOptions.args.length
  });
  
  // Launch browser with proxy
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext(contextOptions);
  
  // Add stealth scripts to avoid detection
  await context.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  return { browser, context, userDataDir };
}

const server = http.createServer(async (req, res) => {
  // Enable CORS with more permissive headers for n8n
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

  const parsedUrl = url.parse(req.url, true);

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // CORS test endpoint
  if (parsedUrl.pathname === '/cors-test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      cors: 'enabled', 
      headers: req.headers,
      method: req.method,
      timestamp: new Date().toISOString() 
    }));
    return;
  }

  // Scraping endpoint
  if (parsedUrl.pathname === '/scrape') {
    // Read body
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString();
    
    try {
      // Parse JSON body
      const { url: targetUrl, proxy } = JSON.parse(body);
      
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameter: url' }));
        return;
      }

      let browser;
      let browserContext;
      let userDataDir;
      
      try {
        console.log('Iniciando scraping:', { targetUrl, proxy: proxy ? 'sim' : 'não' });

        // Try with proxy first, then fallback to direct connection
        let proxyToUse = proxy;
        let useProxy = !!proxy;
        
        // If using serp_api3 zone, switch to web_unlocker1
        if (proxy && proxy.includes('serp_api3')) {
          proxyToUse = proxy.replace('serp_api3', 'web_unlocker1');
          console.log('Switching from serp_api3 to web_unlocker1 zone');
        }
        
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`Attempt ${attempt}: ${useProxy ? `Using proxy: ${proxyToUse}` : 'Direct connection'}`);
            
            // Create browser context with or without proxy
            const result = await createBrowserWithProxy(useProxy ? proxyToUse : null);
            browser = result.browser;
            browserContext = result.context;
            userDataDir = result.userDataDir;
            
            console.log('Browser e context criados com sucesso');
            
            // If we get here, connection is working - break out of retry loop
            break;
            
          } catch (connectionError) {
            console.log(`Connection attempt ${attempt} failed:`, connectionError.message);
            
            // Clean up failed attempt
            if (browser) {
              await browser.close().catch(console.error);
              browser = null;
              browserContext = null;
            }
            if (userDataDir) {
              cleanupUserDataDir(userDataDir);
              userDataDir = null;
            }
            
            // On first attempt failure with proxy, try without proxy
            if (attempt === 1 && useProxy) {
              console.log('Proxy failed, trying direct connection...');
              useProxy = false;
            } else {
              // Both attempts failed
              throw connectionError;
            }
          }
        }

        // Use the existing context for scraping
        const browserPage = await browserContext.newPage();

        // Monitor network events
        browserPage.on('request', request => {
          console.log('>>', request.method(), request.url());
        });

        browserPage.on('response', response => {
          console.log('<<', response.status(), response.url());
        });

        // Scrape the target URL
        console.log(`Scraping: ${targetUrl}`);
        
        // Set appropriate headers
        await browserPage.setExtraHTTPHeaders({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Cache-Control': 'max-age=0'
        });
        
        const response = await browserPage.goto(targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        console.log(`Response status: ${response.status()}`);

        // If 502 with proxy, try without proxy immediately
        if (response.status() === 502 && useProxy) {
          console.log('502 Bad Gateway with proxy - trying without proxy...');
          
          // Close current browser
          await browser.close();
          cleanupUserDataDir(userDataDir);
          
          // Create new browser without proxy
          const result = await createBrowserWithProxy(null);
          browser = result.browser;
          browserContext = result.context;
          userDataDir = result.userDataDir;
          
          const newPage = await browserContext.newPage();
          
          // Set headers again
          await newPage.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Cache-Control': 'max-age=0'
          });
          
          console.log('Trying without proxy...');
          const newResponse = await newPage.goto(targetUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          
          console.log(`Response status (no proxy): ${newResponse.status()}`);
          
          if (!newResponse.ok()) {
            throw new Error(`HTTP ${newResponse.status()}: ${newResponse.statusText()}`);
          }
          
          // Replace browserPage with new page
          await browserPage.close();
          browserPage = newPage;
          
        } else if (!response.ok()) {
          throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
        }

        // Quick wait for content to load
        await browserPage.waitForTimeout(1000);
        
        // Get and format content
        console.log('Formatting content...');
        const formattedContent = await formatPageContent(browserPage);

        // Close browser and context
        await browser.close();
        
        // Clean up user data directory
        cleanupUserDataDir(userDataDir);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          url: targetUrl,
          content: formattedContent,
          timestamp: new Date().toISOString()
        }));

      } catch (error) {
        console.error('Scraping error:', error);
        if (browser) {
          await browser.close().catch(console.error);
        }
        if (userDataDir) {
          cleanupUserDataDir(userDataDir);
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false,
          error: 'Failed to scrape content', 
          details: error.message 
        }));
      }
      return;
    } catch (error) {
      console.error('Error in scraping:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: 'Failed to scrape content', 
        details: error.message 
      }));
    }
  }

  // SSE endpoint for MCP
  if (parsedUrl.pathname === '/sse') {
    try {
      // Create a unique user data directory for this session
      const sessionId = uuidv4();
      const userDataDir = path.join(USER_DATA_DIR_BASE, sessionId);
      
      // Ensure the directory exists
      fs.mkdirSync(userDataDir, { recursive: true });

      // Creates a headless Playwright MCP server
      const connection = await createConnection({
        browser: {
          browserName: 'chromium',
          userDataDir: userDataDir,
          launchOptions: { 
            headless: true,
            args: [
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
              '--no-sandbox',
              '--disable-setuid-sandbox'
            ]
          }
        }
      });

      // Create SSE transport with proper MCP endpoint
      const transport = new SSEServerTransport('/sse', res);
      
      // Connect transport to server
      await connection.server.connect(transport);
      
      // Handle client disconnect
      req.on('close', () => {
        console.log('Client disconnected, cleaning up session:', sessionId);
        cleanupUserDataDir(userDataDir);
        if (connection && connection.browser) {
          connection.browser.close().catch(console.error);
        }
      });

      // Log success
      console.log('SSE connection established:', sessionId);
      
    } catch (error) {
      console.error('SSE connection error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    }
    return;
  }

  // MCP messages endpoint (required by MCP protocol)
  if (parsedUrl.pathname === '/messages') {
    try {
      // Handle MCP message requests
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const body = Buffer.concat(buffers).toString();
      
      // For now, return a simple response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        jsonrpc: '2.0', 
        result: { message: 'MCP endpoint active' },
        id: 1 
      }));
      
    } catch (error) {
      console.error('MCP messages error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        jsonrpc: '2.0', 
        error: { code: -1, message: error.message },
        id: 1 
      }));
    }
    return;
  }

  // Handle unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Cleanup all user data directories on server shutdown
process.on('SIGINT', () => {
  console.log('Cleaning up user data directories...');
  cleanupUserDataDir(USER_DATA_DIR_BASE);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Cleaning up user data directories...');
  cleanupUserDataDir(USER_DATA_DIR_BASE);
  process.exit(0);
});

server.listen(port, () => {
  console.log(`Playwright MCP server running at http://localhost:${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
  console.log(`SSE endpoint available at http://localhost:${port}/sse`);
  console.log(`Scraping endpoint available at http://localhost:${port}/scrape`);
  console.log(`CORS test available at http://localhost:${port}/cors-test`);
  console.log('');
  console.log('Para n8n, use:');
  console.log(`  URL: http://localhost:${port}/sse`);
  console.log('  Transport: Server-Sent Events (SSE)');
  console.log('  Headers: {"Accept": "text/event-stream", "Cache-Control": "no-cache"}');
}); 