#!/usr/bin/env node

import { createConnection } from '@playwright/mcp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import TurndownService from 'turndown';
import { chromium } from 'playwright';

const USER_DATA_DIR_BASE = './user-data-dirs';
const port = process.env.PORT || 8931;
const host = process.env.HOST || 'localhost';

// Ensure user data directory exists
if (!fs.existsSync(USER_DATA_DIR_BASE)) {
  fs.mkdirSync(USER_DATA_DIR_BASE, { recursive: true });
}

// Cleanup function
const cleanupUserDataDir = (dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`Cleaned up user data directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`Error cleaning up user data directory ${dirPath}:`, error);
  }
};

// Configure enhanced Turndown service with advanced rules
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
  preformattedCode: true
});

// Enhanced custom rules for better HTML processing
turndownService.addRule('preserveImages', {
  filter: 'img',
  replacement: function (content, node) {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    const title = node.getAttribute('title') || '';
    const width = node.getAttribute('width');
    const height = node.getAttribute('height');
    
    let result = `![${alt}](${src}${title ? ` "${title}"` : ''})`;
    if (width || height) {
      result += ` <!-- ${width ? `width: ${width}` : ''}${width && height ? ', ' : ''}${height ? `height: ${height}` : ''} -->`;
    }
    return result;
  }
});

// Enhanced buttons and form elements
turndownService.addRule('formElements', {
  filter: ['button', 'input', 'textarea', 'select', 'option'],
  replacement: function (content, node) {
    const type = node.getAttribute('type') || '';
    const value = node.getAttribute('value') || '';
    const placeholder = node.getAttribute('placeholder') || '';
    const name = node.getAttribute('name') || '';
    const text = node.textContent || value || placeholder;
    
    switch (node.tagName.toLowerCase()) {
      case 'button':
        return text ? `**[${text}]**` : '**[Button]**';
      case 'input':
        if (type === 'submit' || type === 'button') {
          return text ? `**[${text}]**` : '**[Button]**';
        } else if (type === 'checkbox' || type === 'radio') {
          return `☐ ${text || name || 'Option'}`;
        } else {
          return `_${placeholder || name || 'Input'}_`;
        }
      case 'textarea':
        return `_${placeholder || name || 'Text Area'}_`;
      case 'select':
        return `▼ ${name || 'Dropdown'}`;
      case 'option':
        return `• ${text}`;
      default:
        return text ? `[${text}]` : '';
    }
  }
});

// Preserve important structural elements
turndownService.addRule('structuralElements', {
  filter: ['nav', 'aside', 'header', 'footer', 'section', 'article'],
  replacement: function (content, node) {
    const tagName = node.tagName.toLowerCase();
    const className = node.getAttribute('class') || '';
    const id = node.getAttribute('id') || '';
    
    let label = '';
    switch (tagName) {
      case 'nav': label = '🧭 Navigation'; break;
      case 'aside': label = '📋 Sidebar'; break;
      case 'header': label = '📄 Header'; break;
      case 'footer': label = '📑 Footer'; break;
      case 'section': label = '📝 Section'; break;
      case 'article': label = '📰 Article'; break;
    }
    
    const identifier = id ? ` (${id})` : className ? ` (${className})` : '';
    return `\n\n### ${label}${identifier}\n\n${content}\n\n`;
  }
});

// Handle tables better
turndownService.addRule('enhancedTables', {
  filter: 'table',
  replacement: function (content, node) {
    // Let Turndown handle basic table conversion, but add context
    const caption = node.querySelector('caption');
    const captionText = caption ? caption.textContent.trim() : '';
    
    return `${captionText ? `**${captionText}**\n\n` : ''}${content}`;
  }
});

// Advanced HTML detection with more patterns
function isHTML(text) {
  if (typeof text !== 'string' || text.length < 10) return false;
  
  // Enhanced HTML detection patterns
  const htmlPatterns = [
    /<[a-zA-Z][^>]*>/g,        // HTML opening tags
    /<\/[a-zA-Z][^>]*>/g,      // HTML closing tags
    /&[a-zA-Z0-9#]+;/g,        // HTML entities
    /<!DOCTYPE/i,              // DOCTYPE declaration
    /<html[^>]*>/i,            // HTML root element
    /<head[^>]*>/i,            // Head element
    /<body[^>]*>/i,            // Body element
  ];
  
  // Count HTML-like patterns
  let htmlScore = 0;
  const totalLength = text.length;
  
  htmlPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      htmlScore += matches.length;
    }
  });
  
  // More sophisticated detection
  const hasStructuralHTML = /<(div|span|p|h[1-6]|ul|ol|li|table|tr|td|th)[^>]*>/i.test(text);
  const hasHTMLEntities = /&[a-zA-Z0-9#]+;/.test(text);
  const tagDensity = htmlScore / (totalLength / 100); // Tags per 100 characters
  
  // Decision logic
  if (hasStructuralHTML || tagDensity > 1 || (htmlScore > 3 && hasHTMLEntities)) {
    console.log(`🔍 HTML detected - Score: ${htmlScore}, Density: ${tagDensity.toFixed(2)}, Structural: ${hasStructuralHTML}, Entities: ${hasHTMLEntities}`);
    return true;
  }
  
  return false;
}

// Enhanced HTML to Markdown conversion with preprocessing
function htmlToMarkdown(html) {
  try {
    console.log(`🔄 Processing HTML content (${html.length} chars)...`);
    
    // Enhanced preprocessing
    let processedHtml = html
      // Remove scripts, styles, and comments
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // Convert common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Handle line breaks better
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      // Preserve pre-formatted content
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (match, content) => {
        return `<pre>${content.replace(/\n/g, '\\n')}</pre>`;
      });
    
    // Convert to markdown
    const markdown = turndownService.turndown(processedHtml);
    
    // Enhanced post-processing
    const cleanMarkdown = markdown
      // Fix excessive whitespace
      .replace(/\n{4,}/g, '\n\n\n')     // Max 3 consecutive newlines
      .replace(/[ \t]+$/gm, '')         // Remove trailing spaces
      .replace(/^\s+$/gm, '')           // Remove lines with only spaces
      // Fix list formatting
      .replace(/^(\s*)-\s*$/gm, '')     // Remove empty list items
      .replace(/^(\s*)\*(\s+)/gm, '$1-$2') // Convert * to - for consistency
      // Fix link formatting
      .replace(/\[([^\]]+)\]\(\s*\)/g, '[$1]') // Remove empty links
      .replace(/!\[([^\]]*)\]\(\s*\)/g, '') // Remove empty images
      // Restore pre-formatted content
      .replace(/<pre>([\s\S]*?)<\/pre>/gi, (match, content) => {
        return '```\n' + content.replace(/\\n/g, '\n') + '\n```';
      })
      .trim();
    
    console.log(`✅ HTML→Markdown conversion completed: ${html.length} → ${cleanMarkdown.length} chars`);
    
    return cleanMarkdown;
    
  } catch (error) {
    console.error('❌ Error converting HTML to Markdown:', error);
    return html; // Return original if conversion fails
  }
}

// Enhanced tool result processing with better context awareness
function processToolResult(result) {
  if (!result || !result.content) return result;
  
  try {
    console.log('🔄 Processing tool result for HTML content...');
    
    // Process each content item with context
    const processedContent = result.content.map((item, index) => {
      if (item.type === 'text' && item.text) {
        if (isHTML(item.text)) {
          console.log(`🔍 Converting HTML content in item ${index + 1}...`);
          const converted = htmlToMarkdown(item.text);
          return {
            ...item,
            text: converted,
            // Add metadata to track conversion
            _converted: true,
            _originalLength: item.text.length,
            _convertedLength: converted.length
          };
        } else {
          // Check for partial HTML content (mixed text with HTML elements)
          const htmlSegments = item.text.match(/<[^>]+>[\s\S]*?<\/[^>]+>/g);
          if (htmlSegments && htmlSegments.length > 0) {
            console.log(`🔍 Converting partial HTML segments in item ${index + 1}...`);
            let processedText = item.text;
            htmlSegments.forEach(segment => {
              if (isHTML(segment)) {
                const converted = htmlToMarkdown(segment);
                processedText = processedText.replace(segment, converted);
              }
            });
            return {
              ...item,
              text: processedText,
              _partialConversion: true
            };
          }
        }
      }
      return item;
    });
    
    const conversionStats = processedContent.filter(item => item._converted || item._partialConversion);
    if (conversionStats.length > 0) {
      console.log(`✅ Processed ${conversionStats.length} items with HTML content`);
    }
    
    return {
      ...result,
      content: processedContent
    };
  } catch (error) {
    console.error('❌ Error processing tool result:', error);
    return result; // Return original if processing fails
  }
}

// Function to convert HTML to Markdown like crawl4ai (for scraping endpoint)
async function formatPageContent(page) {
  try {
    // Get the full HTML content
    const html = await page.content();
    return htmlToMarkdown(html);
    
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

// SSE sessions map (following official pattern)
const sseSessions = new Map();

// Enhanced SSE Transport with intelligent HTML processing
class EnhancedSSETransport extends SSEServerTransport {
  constructor(endpoint, response) {
    super(endpoint, response);
    
    // Ensure we have the original methods before binding
    if (typeof this.sendEvent === 'function') {
      const originalSendEvent = this.sendEvent.bind(this);
      
      this.sendEvent = (method, params) => {
        try {
          console.log(`📡 SSE Event: ${method}`);
          
          // Process different types of MCP messages that might contain HTML
          if (params) {
            // Tool call results
            if (params.result && params.result.content) {
              console.log('🔄 Processing tool call result...');
              params.result = processToolResult(params.result);
            }
            
            // Tool list responses
            if (params.tools && Array.isArray(params.tools)) {
              console.log('🔄 Processing tool list...');
              params.tools = params.tools.map(tool => {
                if (tool.description && isHTML(tool.description)) {
                  tool.description = htmlToMarkdown(tool.description);
                }
                return tool;
              });
            }
            
            // Generic content processing for any message with content
            if (params.content && Array.isArray(params.content)) {
              console.log('🔄 Processing message content...');
              params.content = params.content.map(item => {
                if (item.type === 'text' && item.text && isHTML(item.text)) {
                  return {
                    ...item,
                    text: htmlToMarkdown(item.text)
                  };
                }
                return item;
              });
            }
            
            // Error messages that might contain HTML
            if (params.error && params.error.message && isHTML(params.error.message)) {
              console.log('🔄 Processing error message...');
              params.error.message = htmlToMarkdown(params.error.message);
            }
          }
          
          return originalSendEvent(method, params);
        } catch (error) {
          console.error('❌ Error in enhanced sendEvent:', error);
          return originalSendEvent(method, params);
        }
      };
    }
    
    // Only override send if it exists
    if (typeof this.send === 'function') {
      const originalSend = this.send.bind(this);
      
      this.send = (message) => {
        try {
          // Process raw messages
          if (typeof message === 'object' && message.result && message.result.content) {
            message.result = processToolResult(message.result);
          }
          return originalSend(message);
        } catch (error) {
          console.error('❌ Error in enhanced send:', error);
          return originalSend(message);
        }
      };
    }
    
    console.log('🔧 Enhanced SSE Transport initialized with advanced HTML→Markdown processing');
  }
  
  // Add fallback methods if they don't exist in parent class
  handlePostMessage(req, res) {
    if (typeof super.handlePostMessage === 'function') {
      return super.handlePostMessage(req, res);
    }
    console.warn('⚠️ handlePostMessage not implemented in parent class');
    res.writeHead(501);
    res.end('Not Implemented');
  }
}

// Handle SSE requests (following official pattern from transport.ts)
async function handleSSE(req, res, urlObj) {
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
    const userDataDir = path.join(USER_DATA_DIR_BASE, sessionUuid);
    
    // Ensure the directory exists
    fs.mkdirSync(userDataDir, { recursive: true });

    try {
      console.log(`🚀 Creating enhanced MCP connection for SSE session: ${sessionUuid}`);

      // Create connection using official Playwright MCP with official pattern
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

      // Create enhanced SSE transport with advanced HTML processing
      const transport = new EnhancedSSETransport('/sse', res);
      sseSessions.set(transport.sessionId, transport);
      
      console.log(`✅ Created enhanced SSE session: ${transport.sessionId} (uuid: ${sessionUuid})`);
      console.log('🔧 Features enabled: Advanced HTML detection, Intelligent conversion, Content processing');
      
      // Connect the server to the transport
      await connection.server.connect(transport);
      
      // Handle client disconnect
      res.on('close', () => {
        console.log(`👋 Client disconnected, cleaning up session: ${transport.sessionId} (uuid: ${sessionUuid})`);
        sseSessions.delete(transport.sessionId);
        cleanupUserDataDir(userDataDir);
        if (connection && connection.browser) {
          connection.browser.close().catch(console.error);
        }
      });

      // Log successful connection
      console.log(`🎉 Enhanced SSE connection established: ${transport.sessionId}`);
      
    } catch (error) {
      console.error('❌ SSE connection error:', error);
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
      server: 'Enhanced Official Playwright MCP Server',
      sessions: sseSessions.size,
      features: [
        'Advanced HTML→Markdown conversion',
        'Intelligent content detection', 
        'Enhanced SSE Transport', 
        'Official MCP Tools',
        'Structural element preservation',
        'Form element processing',
        'Table enhancement'
      ]
    }));
    return;
  }

  // Custom scraping endpoint (additional functionality)
  if (parsedUrl.pathname === '/scrape') {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = Buffer.concat(buffers).toString();
    
    try {
      const { url: targetUrl, proxy } = JSON.parse(body);
      
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameter: url' }));
        return;
      }

      // Create temporary browser for scraping
      const sessionId = uuidv4();
      const userDataDir = path.join(USER_DATA_DIR_BASE, sessionId);
      fs.mkdirSync(userDataDir, { recursive: true });

      let launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--ignore-certificate-errors',
          '--disable-blink-features=AutomationControlled'
        ],
        ignoreHTTPSErrors: true
      };

      // Add proxy if provided
      if (proxy) {
        const proxyMatch = proxy.match(/^(.+):(.+)@(.+):(\d+)$/);
        if (proxyMatch) {
          const [, username, password, host, port] = proxyMatch;
          launchOptions.proxy = {
            server: `http://${host}:${port}`,
            username: username,
            password: password
          };
        }
      }

      // Launch browser directly for scraping
      const browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });

      const page = await context.newPage();
      
      console.log(`Scraping: ${targetUrl}`);
      const response = await page.goto(targetUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      await page.waitForTimeout(2000);

      // Get and format content using the improved function
      console.log('Formatting content...');
      const cleanContent = await formatPageContent(page);

      await browser.close();
      cleanupUserDataDir(userDataDir);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        url: targetUrl,
        content: cleanContent,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error('Scraping error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: 'Failed to scrape content', 
        details: error.message 
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
  console.log('Cleaning up user data directories...');
  cleanupUserDataDir(USER_DATA_DIR_BASE);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Cleaning up user data directories...');
  cleanupUserDataDir(USER_DATA_DIR_BASE);
  process.exit(0);
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
  console.log('🎉 SERVIDOR OFICIAL MELHORADO - Conversão HTML→Markdown Avançada:');
  console.log('  ✅ Usa estrutura oficial do projeto Microsoft');
  console.log('  ✅ Gerenciamento de sessões SSE igual ao original');
  console.log('  ✅ Transporte SSE oficial (@modelcontextprotocol/sdk)');
  console.log('  ✅ Conversão HTML→Markdown inteligente e avançada');
  console.log('  ✅ Pronto para integração com n8n e outros clientes MCP');
  console.log('');
  console.log('🔄 Advanced HTML→Markdown Features:');
  console.log('  🎯 Detecção inteligente de HTML com scoring algorithm');
  console.log('  🏗️  Preservação de elementos estruturais (nav, aside, header, etc.)');
  console.log('  📝 Processamento avançado de formulários e botões');
  console.log('  📊 Melhor formatação de tabelas com captions');
  console.log('  🖼️  Preservação de metadados de imagens (dimensões)');
  console.log('  📱 Conversão de HTML parcial em texto misto');
  console.log('  🧹 Limpeza avançada e pós-processamento');
  console.log('  📡 Interceptação de múltiplos tipos de mensagens MCP');
  console.log('  📈 Logging detalhado e estatísticas de conversão');
}); 