# ✅ Configuração Final do Playwright MCP para n8n

## 🎯 Problema Identificado e Solução

**Problema**: O n8n conecta mas desconecta porque:
1. O servidor MCP oficial usa **sessões persistentes** via SSE
2. Cada requisição HTTP cria uma nova sessão
3. O n8n precisa manter a conexão SSE ativa

**Solução**: Usar **SSE** com configuração específica

---

## 🚀 Configuração Correta para n8n

### ✅ Opção 1: MCP Node com SSE (FUNCIONA)

**No n8n MCP node:**
- **Transport Type**: `Server-Sent Events` ou `SSE`
- **URL**: `http://localhost:8931/sse`
- **Headers**: 
  ```json
  {
    "Accept": "application/json, text/event-stream",
    "Cache-Control": "no-cache"
  }
  ```
- **Timeout**: 120000ms (2 minutos)
- **Auto-reconnect**: true
- **Keep-Alive**: true

### ✅ Opção 2: STDIO (MAIS ESTÁVEL)

**No n8n MCP node:**
- **Transport Type**: `stdio`
- **Command**: `npx`
- **Arguments**: 
  ```
  @playwright/mcp
  --headless
  --no-sandbox
  --ignore-https-errors
  --caps
  tabs,pdf,history,wait,files
  --user-data-dir
  ./user-data-dirs/n8n
  ```
- **Working Directory**: `/Users/moises/Documents/playwright_server`

---

## 🔧 Servidor Oficial Rodando

```bash
# Servidor ativo na porta 8931
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
```

**Status**: ✅ Ativo e funcionando

---

## 🧪 Teste de Funcionamento

### 1. Verificar SSE:
```bash
curl -v http://localhost:8931/sse
# Deve retornar: event: endpoint
```

### 2. Verificar inicialização:
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' \
  http://localhost:8931/mcp
```

### 3. Testar STDIO:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | npx @playwright/mcp --port 0
```

---

## 🛠️ Tools Disponíveis

Após conectar, você terá acesso a todos os tools oficiais:

### 🌐 Navegação
- `browser_navigate` - Ir para URL
- `browser_navigate_back` - Voltar
- `browser_navigate_forward` - Avançar

### 🖱️ Interação
- `browser_click` - Clicar elementos
- `browser_type` - Digitar texto
- `browser_hover` - Hover
- `browser_drag` - Arrastar
- `browser_select_option` - Selecionar

### 📸 Captura
- `browser_snapshot` - Snapshot (melhor para análise)
- `browser_take_screenshot` - Screenshot
- `browser_pdf_save` - Salvar PDF

### ⏰ Aguardar
- `browser_wait_for` - Aguardar elementos/tempo

### 📁 Abas
- `browser_tab_list` - Listar abas
- `browser_tab_new` - Nova aba
- `browser_tab_select` - Selecionar aba
- `browser_tab_close` - Fechar aba

---

## 📋 Workflow YellowPages Recomendado

### Passo 1: Navegar
```json
{
  "tool": "browser_navigate",
  "arguments": {
    "url": "https://www.yellowpages.com/search?search_terms=Day%20Care&geo_location_terms=salt%20lake%20city"
  }
}
```

### Passo 2: Aguardar carregamento
```json
{
  "tool": "browser_wait_for",
  "arguments": {
    "time": 3
  }
}
```

### Passo 3: Capturar conteúdo
```json
{
  "tool": "browser_snapshot",
  "arguments": {}
}
```

### Passo 4: Próxima página (se necessário)
```json
{
  "tool": "browser_click",
  "arguments": {
    "element": "Next page button",
    "ref": "a[aria-label='Next']"
  }
}
```

---

## 🔧 Troubleshooting

### Problema: "Conecta mas desconecta imediatamente"

**Solução**:
1. ✅ Use **Opção 2 (STDIO)** - mais estável
2. ✅ Verifique se o servidor está rodando: `ps aux | grep @playwright/mcp`
3. ✅ Reinicie se necessário: `./start-official-mcp.sh`

### Problema: "Tools não aparecem"

**Solução**:
1. ✅ Aguarde alguns segundos após conexão
2. ✅ Verifique se o n8n está usando a URL correta
3. ✅ Tente a **Opção 2 (STDIO)**

### Problema: "Timeout"

**Solução**:
1. ✅ Aumente o timeout para 120000ms
2. ✅ Use STDIO em vez de SSE
3. ✅ Verifique se não há firewall bloqueando

---

## 🎯 Recomendação Final

**Para máxima estabilidade no n8n:**

1. **Use STDIO** (Opção 2) em vez de SSE
2. **Configure timeout** de 2 minutos
3. **Teste primeiro** com `browser_navigate` para https://example.com
4. **Depois teste** com YellowPages

**Configuração STDIO no n8n:**
```
Transport: stdio
Command: npx
Arguments: @playwright/mcp --headless --no-sandbox --ignore-https-errors --caps tabs,pdf,history,wait,files --user-data-dir ./user-data-dirs/n8n
Working Directory: /Users/moises/Documents/playwright_server
```

**Esta configuração deve resolver o problema de desconexão!** ✅ 