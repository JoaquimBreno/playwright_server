#!/usr/bin/env node

// Importar módulos usando ES modules
import EventSource from 'eventsource';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MCP_SERVER = 'http://localhost:8931';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=massa+plastica';

// Cores para output colorido
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Função para formatar timestamp
function timestamp() {
  return new Date().toISOString().split('T')[1].slice(0, -1);
}

// Função para fazer log colorido
function log(type, message, data = null) {
  const types = {
    info: colors.blue + '📝',
    success: colors.green + '✅',
    error: colors.red + '❌',
    warning: colors.yellow + '⚠️',
    sse: colors.magenta + '📡',
    scrape: colors.cyan + '🔍',
    debug: colors.dim + '🔧',
  };
  
  console.log(
    `${colors.dim}[${timestamp()}]${colors.reset} ${types[type]} ${message}${colors.reset}`
  );
  
  if (data) {
    console.log(colors.dim + JSON.stringify(data, null, 2) + colors.reset);
  }
}

// Função para testar o endpoint de scraping
async function testScraping() {
  try {
    log('scrape', 'Iniciando teste do endpoint de scraping...');
    
    const response = await fetch(`${MCP_SERVER}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: GOOGLE_SEARCH_URL
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      log('success', 'Scraping realizado com sucesso!');
      log('info', 'Conteúdo convertido para Markdown:');
      console.log('\n' + colors.cyan + data.content + colors.reset + '\n');
    } else {
      throw new Error(data.error);
    }
    
  } catch (error) {
    log('error', `Erro no teste de scraping: ${error.message}`);
  }
}

// Função para testar o SSE
function testSSE() {
  return new Promise((resolve, reject) => {
    log('sse', 'Iniciando teste do SSE...');
    
    let sessionId = null;
    let hasNavigated = false;
    
    // Criar instância do EventSource
    const sse = new EventSource(`${MCP_SERVER}/sse`, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });
    
    // Timeout para garantir que não ficará preso
    const timeout = setTimeout(() => {
      log('error', 'Timeout atingido - Detalhes da conexão:');
      log('debug', 'Estado da conexão:', {
        sessionId,
        hasNavigated,
        readyState: sse.readyState,
        url: sse.url
      });
      sse.close();
      reject(new Error('Timeout - SSE não respondeu em tempo hábil'));
    }, 30000);
    
    // Handler de conexão
    sse.onopen = async () => {
      log('success', 'Conexão SSE estabelecida');
      log('debug', 'URL da conexão:', sse.url);
      
      // Enviar mensagem de inicialização MCP
      try {
        log('info', 'Enviando mensagem de inicialização MCP...');
        const response = await fetch(`${MCP_SERVER}/sse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              name: 'test-client',
              version: '1.0.0',
              capabilities: {
                tools: {
                  core: true,
                  tabs: true,
                  pdf: true,
                  history: true,
                  wait: true,
                  files: true,
                  install: true
                }
              }
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`Falha na inicialização: ${response.status}`);
        }
        
        const initResult = await response.json();
        log('debug', 'Resposta da inicialização:', initResult);
        
        if (initResult.error) {
          throw new Error(`Erro na inicialização: ${initResult.error.message || JSON.stringify(initResult.error)}`);
        }
        
        log('success', 'Mensagem de inicialização enviada');
        
      } catch (error) {
        log('error', `Erro na inicialização: ${error.message}`);
        sse.close();
        clearTimeout(timeout);
        reject(error);
      }
    };
    
    // Handler de mensagens
    sse.onmessage = async (event) => {
      try {
        log('debug', 'Mensagem SSE recebida:', event.data);
        const data = JSON.parse(event.data);
        
        // Log do evento recebido
        log('info', `Evento SSE recebido: ${data.method || 'sem método'}`);
        
        // Se recebeu resposta da inicialização
        if (data.method === 'initialized') {
          log('success', 'MCP inicializado com sucesso');
          sessionId = data.params?.sessionId;
          
          if (!sessionId) {
            throw new Error('SessionId não recebido na inicialização');
          }
          
          log('success', `SessionId recebido: ${sessionId}`);
          
          // Agora que temos o sessionId, enviar comando de navegação
          if (!hasNavigated) {
            hasNavigated = true;
            log('info', 'Enviando comando de navegação...');
            
            const response = await fetch(`${MCP_SERVER}/sse`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: {
                  name: 'browser_navigate',
                  arguments: {
                    url: GOOGLE_SEARCH_URL
                  }
                }
              })
            });
            
            if (!response.ok) {
              throw new Error(`Falha ao enviar comando: ${response.status}`);
            }
            
            const navResult = await response.json();
            log('debug', 'Resposta do comando de navegação:', navResult);
            
            if (navResult.error) {
              throw new Error(`Erro na navegação: ${navResult.error.message || JSON.stringify(navResult.error)}`);
            }
            
            log('success', 'Comando de navegação enviado');
          }
        }
        
        // Se recebeu resultado da navegação
        if (data.method === 'tools/call' && data.params?.result?.content) {
          log('success', 'Conteúdo da página recebido via SSE:');
          console.log('\n' + colors.magenta + JSON.stringify(data.params.result.content, null, 2) + colors.reset + '\n');
          
          // Limpar timeout e resolver
          clearTimeout(timeout);
          sse.close();
          resolve();
        }
        
      } catch (error) {
        log('error', `Erro ao processar mensagem SSE: ${error.message}`);
        log('debug', 'Dados da mensagem:', event.data);
        sse.close();
        clearTimeout(timeout);
        reject(error);
      }
    };
    
    // Handler de erros
    sse.onerror = (error) => {
      log('error', `Erro na conexão SSE: ${error.message || 'Erro desconhecido'}`);
      log('debug', 'Estado da conexão no erro:', {
        readyState: sse.readyState,
        url: sse.url
      });
      sse.close();
      clearTimeout(timeout);
      reject(error);
    };
  });
}

// Função para verificar se o servidor está rodando
async function checkServer() {
  try {
    const response = await fetch(`${MCP_SERVER}/health`);
    if (!response.ok) {
      throw new Error(`Health check falhou com status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Servidor não está rodando em ${MCP_SERVER}`);
    }
    throw error;
  }
}

// Função principal que executa os testes
async function runTests() {
  log('info', 'Iniciando testes de scraping do Google...');
  
  try {
    // Testar health check primeiro
    log('info', 'Verificando saúde do servidor...');
    
    // Tentar algumas vezes caso o servidor esteja iniciando
    let retries = 3;
    let healthData;
    
    while (retries > 0) {
      try {
        healthData = await checkServer();
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw error;
        }
        log('warning', `Tentando novamente em 1s... (${retries} tentativas restantes)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    log('debug', 'Resposta do health check:', healthData);
    
    if (healthData.status === 'healthy') {
      // Log das features disponíveis
      if (healthData.features && Array.isArray(healthData.features)) {
        log('success', `Servidor saudável! Features disponíveis:`);
        healthData.features.forEach(feature => {
          log('info', `• ${feature}`);
        });
      } else {
        log('success', 'Servidor saudável!');
      }
      
      // Executar teste de SSE
      log('info', 'Executando teste via SSE...');
      await testSSE();
      
      // Executar teste de scraping
      log('info', 'Executando teste via endpoint de scraping...');
      await testScraping();
      
      log('success', 'Todos os testes completados com sucesso! 🎉');
      
    } else {
      throw new Error(`Servidor não está saudável: ${healthData.status}`);
    }
    
  } catch (error) {
    log('error', `Falha nos testes: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      log('info', 'Dica: Certifique-se que o servidor está rodando com "npm start"');
    }
    process.exit(1);
  }
}

// Executar os testes
runTests(); 