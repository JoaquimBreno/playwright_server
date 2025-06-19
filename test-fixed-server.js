#!/usr/bin/env node

import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

const SERVER_URL = 'http://localhost:8931';

class FixedMCPTester {
  constructor() {
    this.messageId = 1;
  }

  log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
  }

  async testHealthCheck() {
    this.log('🔍 Testing health check endpoint...');
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      const data = await response.json();
      this.log(`✅ Health check OK: ${JSON.stringify(data)}`);
      return true;
    } catch (error) {
      this.log(`❌ Health check failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async testStatus() {
    this.log('📊 Testing status endpoint...');
    try {
      const response = await fetch(`${SERVER_URL}/status`);
      const data = await response.json();
      this.log(`✅ Status OK: ${JSON.stringify(data, null, 2)}`);
      return true;
    } catch (error) {
      this.log(`❌ Status failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async testSSEConnection() {
    this.log('🔗 Testing SSE connection (expecting MCP protocol)...');
    
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        this.log('⏰ SSE test timeout after 15 seconds');
        resolve(false);
      }, 15000);

      let eventCount = 0;
      let hasReceivedMCPData = false;

      fetch(`${SERVER_URL}/sse`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        
        this.log(`SSE Response status: ${response.status}`);
        this.log(`SSE Response headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);

        if (!response.ok) {
          this.log(`❌ SSE connection failed: ${response.status} ${response.statusText}`, 'ERROR');
          return response.text().then(text => {
            this.log(`Response body: ${text}`, 'ERROR');
            resolve(false);
          });
        }

        this.log('✅ SSE connection established, listening for MCP messages...');

        // Parse SSE stream manually
        const reader = response.body.getReader ? response.body.getReader() : null;
        if (!reader) {
          // Fallback for node-fetch
          this.log('📨 Using text parsing for SSE stream...');
          
          response.text().then(text => {
            this.log(`📨 SSE Raw data: ${text.substring(0, 500)}...`);
            hasReceivedMCPData = text.includes('event:') || text.includes('data:');
            
            if (hasReceivedMCPData) {
              this.log('✅ Received SSE data - MCP connection working!');
            } else {
              this.log('⚠️ No SSE events received', 'WARN');
            }
            
            resolve(hasReceivedMCPData);
          }).catch(error => {
            this.log(`❌ Error reading SSE stream: ${error.message}`, 'ERROR');
            resolve(false);
          });
          
          return;
        }

        // Modern fetch API with streams
        const decoder = new TextDecoder();
        let buffer = '';

        const readChunk = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              this.log('📨 SSE stream ended');
              resolve(hasReceivedMCPData);
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                eventCount++;
                this.log(`📨 SSE event ${eventCount}: ${line}`);
                
                if (line.startsWith('event:') || line.startsWith('data:')) {
                  hasReceivedMCPData = true;
                }
              }
            }

            if (eventCount >= 3) {
              this.log(`✅ Received ${eventCount} SSE events - connection working!`);
              reader.releaseLock();
              resolve(true);
            } else {
              readChunk(); // Continue reading
            }
          }).catch(error => {
            this.log(`❌ Error reading SSE chunk: ${error.message}`, 'ERROR');
            resolve(false);
          });
        };

        readChunk();

      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          this.log('⚠️ SSE connection timeout', 'WARN');
        } else {
          this.log(`❌ SSE connection error: ${error.message}`, 'ERROR');
        }
        resolve(false);
      });
    });
  }

  async testMultipleConnections() {
    this.log('🔗 Testing multiple simultaneous SSE connections...');
    
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(this.testSingleConnection(i + 1));
    }

    try {
      const results = await Promise.all(promises);
      const successful = results.filter(r => r).length;
      this.log(`✅ Multiple connections test: ${successful}/3 successful`);
      return successful >= 2; // At least 2 should work
    } catch (error) {
      this.log(`❌ Multiple connections test failed: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async testSingleConnection(connectionId) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, 10000);

      fetch(`${SERVER_URL}/sse`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        this.log(`🔗 Connection ${connectionId}: ${response.status} ${response.statusText}`);
        resolve(response.ok);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name !== 'AbortError') {
          this.log(`❌ Connection ${connectionId} failed: ${error.message}`, 'ERROR');
        }
        resolve(false);
      });
    });
  }

  async testConnectionStability() {
    this.log('⏱️ Testing connection stability (30 seconds)...');
    
    return new Promise((resolve) => {
      const controller = new AbortController();
      let connected = false;
      let lastActivity = Date.now();
      
      const stabilityTimeout = setTimeout(() => {
        controller.abort();
        const duration = Math.round((Date.now() - lastActivity) / 1000);
        this.log(`⏱️ Connection stability test completed: ${duration}s`);
        resolve(connected && duration >= 25); // Should stay connected for at least 25s
      }, 30000);

      fetch(`${SERVER_URL}/sse`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      })
      .then(response => {
        if (response.ok) {
          connected = true;
          this.log('✅ Stability test: Connection established');
          
          // Keep checking if connection is alive
          const checkInterval = setInterval(() => {
            if (controller.signal.aborted) {
              clearInterval(checkInterval);
              return;
            }
            lastActivity = Date.now();
          }, 5000);
          
        } else {
          this.log(`❌ Stability test: Connection failed ${response.status}`, 'ERROR');
          clearTimeout(stabilityTimeout);
          resolve(false);
        }
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          this.log(`❌ Stability test error: ${error.message}`, 'ERROR');
        }
        clearTimeout(stabilityTimeout);
        resolve(false);
      });
    });
  }

  async runFullTest() {
    this.log('🚀 Starting Fixed MCP Server Test...');
    
    try {
      // Test health check
      const healthOk = await this.testHealthCheck();
      if (!healthOk) {
        throw new Error('Health check failed');
      }

      // Test status
      await this.testStatus();
      
      // Test SSE connection
      const sseOk = await this.testSSEConnection();
      if (!sseOk) {
        this.log('⚠️ SSE connection test failed, but continuing...', 'WARN');
      }
      
      // Test multiple connections
      const multiOk = await this.testMultipleConnections();
      if (multiOk) {
        this.log('✅ Multiple connections test passed');
      } else {
        this.log('⚠️ Multiple connections test failed', 'WARN');
      }
      
      // Test connection stability
      const stabilityOk = await this.testConnectionStability();
      if (stabilityOk) {
        this.log('✅ Connection stability test passed');
      } else {
        this.log('⚠️ Connection stability test failed', 'WARN');
      }
      
      this.log('✅ Fixed server tests completed');
      
    } catch (error) {
      this.log(`❌ Test failed: ${error.message}`, 'ERROR');
    }
    
    this.log('🏁 Test finished');
  }
}

// Run the test
const tester = new FixedMCPTester();
tester.runFullTest().catch(console.error); 