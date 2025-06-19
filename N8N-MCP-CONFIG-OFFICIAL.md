# Configuração Oficial do Playwright MCP para n8n

## ✅ Servidor Oficial Rodando

O servidor oficial está rodando na porta 8931 com as seguintes opções:

```bash
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

---

## 🎯 Configurações para n8n

### Opção 1: MCP Node com SSE (RECOMENDADO)

**No n8n MCP node:**
- **Transport Type**: `sse` ou `Server-Sent Events`
- **URL**: `http://localhost:8931/sse`
- **Timeout**: 60000ms
- **Auto-reconnect**: true

### Opção 2: MCP Node com HTTP Streamable

**No n8n MCP node:**
- **Transport Type**: `http` ou `HTTP`
- **URL**: `http://localhost:8931/mcp`
- **Method**: POST
- **Headers**: `Content-Type: application/json`

### Opção 3: MCP Node com STDIO (ALTERNATIVO)

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
  ```
- **Working Directory**: `/Users/moises/Documents/playwright_server`

---

## 🛠️ Tools Disponíveis

O servidor oficial oferece todos os tools padrão do Playwright:

### Navegação
- `browser_navigate` - Navegar para URL
- `browser_navigate_back` - Voltar
- `browser_navigate_forward` - Avançar

### Interação
- `browser_click` - Clicar em elementos
- `browser_type` - Digitar texto
- `browser_hover` - Hover sobre elementos
- `browser_drag` - Arrastar elementos
- `browser_select_option` - Selecionar opções

### Captura
- `browser_snapshot` - Snapshot da página
- `browser_take_screenshot` - Screenshot
- `browser_pdf_save` - Salvar PDF

### Aguardar
- `browser_wait_for` - Aguardar condições

### Abas
- `browser_tab_list` - Listar abas
- `browser_tab_new` - Nova aba
- `browser_tab_select` - Selecionar aba
- `browser_tab_close` - Fechar aba

### Arquivos
- `browser_file_upload` - Upload de arquivos

### Utilitários
- `browser_install` - Instalar browser
- `browser_close` - Fechar browser
- `browser_resize` - Redimensionar

---

## 🧪 Teste de Conexão

### 1. Verificar se o servidor está rodando:
```bash
curl http://localhost:8931/sse
```

### 2. Testar tools disponíveis:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' \
  http://localhost:8931/mcp
```

### 3. Testar navegação:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "browser_navigate", "arguments": {"url": "https://example.com"}}}' \
  http://localhost:8931/mcp
```

---

## 🔧 Troubleshooting

### Problema: "Conexão estabelece mas desconecta"

**Causa**: O n8n pode estar usando configuração incorreta

**Solução**:
1. Use a **Opção 1** (SSE) primeiro
2. Se não funcionar, tente a **Opção 2** (HTTP)
3. Como último recurso, use a **Opção 3** (STDIO)

### Problema: "Tools não aparecem"

**Causa**: Endpoint incorreto

**Solução**:
- Para SSE: `http://localhost:8931/sse`
- Para HTTP: `http://localhost:8931/mcp`

### Problema: "Timeout na conexão"

**Causa**: Servidor não está respondendo

**Solução**:
```bash
# Reiniciar servidor
./start-official-mcp.sh
```

---

## 📋 Exemplo de Uso para YellowPages

### 1. Navegar para YellowPages:
```json
{
  "tool": "browser_navigate",
  "arguments": {
    "url": "https://www.yellowpages.com/search?search_terms=Day%20Care&geo_location_terms=salt%20lake%20city"
  }
}
```

### 2. Capturar snapshot:
```json
{
  "tool": "browser_snapshot",
  "arguments": {}
}
```

### 3. Clicar em próxima página:
```json
{
  "tool": "browser_click",
  "arguments": {
    "element": "Next page button",
    "ref": "button[aria-label='Next']"
  }
}
```

---

## 🎯 Status Atual

- ✅ Servidor oficial rodando na porta 8931
- ✅ SSE endpoint: `http://localhost:8931/sse`
- ✅ HTTP endpoint: `http://localhost:8931/mcp`
- ✅ Todos os tools oficiais disponíveis
- ✅ Configuração otimizada para scraping

**Tente primeiro a Opção 1 (SSE) no n8n!** 