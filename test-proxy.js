import { chromium } from 'playwright';
import 'dotenv/config';

const PROXY_CONFIG = {
  wsEndpoint: process.env.PROXY_WS_ENDPOINT || 'wss://brd-customer-hl_928b621d-zone-scraping_browser2:baqsudiakf9l@brd.superproxy.io:9222'
};

async function testProxy() {
  console.log('Testing proxy connection...');
  
  try {
    // Connect to the browser using only the wsEndpoint
    console.log('Connecting to browser...');
    const browser = await chromium.connectOverCDP(PROXY_CONFIG.wsEndpoint);
    
    // Create a new context with minimal settings
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    // Create a new page
    const page = await context.newPage();
    
    // Test IP check website
    console.log('Testing connection...');
    await page.goto('https://lumtest.com/myip.json');
    const ip = await page.evaluate(() => document.body.textContent);
    
    console.log('Connection successful!');
    console.log('Page response:', ip);
    
    // Close browser
    await browser.close();
    
  } catch (error) {
    console.error('Error testing proxy:', error.message);
    console.log('\nTroubleshooting tips:');
    console.log('1. Verify your Bright Data credentials are correct');
    console.log('2. Check if your Bright Data subscription is active');
    console.log('3. Ensure you\'re using the correct proxy zone (Scraping Browser)');
    console.log('4. Try regenerating your Bright Data proxy token');
    console.log('\nFull error:', error);
  }
}

testProxy(); 