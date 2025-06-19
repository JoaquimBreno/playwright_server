# Configuração do MCP no n8n

## Opção 1: Servidor MCP via STDIO (RECOMENDADO)

### 1. Configuração no n8n:

**No node MCP do n8n, use estas configurações:**

- **Transport Type**: `stdio`
- **Command**: `node`
- **Arguments**: 
  ```
  /Users/moises/Documents/playwright_server/mcp-server.js
  ```
- **Working Directory**: `/Users/moises/Documents/playwright_server`

### 2. Usando o tool `scrape_page`:

**Parâmetros:**
- `url` (obrigatório): URL para fazer scraping
- `proxy` (opcional): Proxy no formato `username:password@host:port`

**Exemplo de uso:**
```json
{
  "url": "https://www.yellowpages.com/search?search_terms=Day%20Care&geo_location_terms=salt%20lake%20city",
  "proxy": "brd-customer-hl_928b621d-zone-web_unlocker1:u3ya0stcidaa@brd.superproxy.io:33335"
}
```

---

## Opção 2: Servidor HTTP (ALTERNATIVO)

Se a Opção 1 não funcionar, use o servidor HTTP:

### 1. Manter o servidor rodando:
```bash
node server.js
```

### 2. No n8n, usar HTTP Request node:
- **Method**: POST
- **URL**: `http://localhost:8931/scrape`
- **Body**:
```json
{
  "url": "https://www.yellowpages.com/search?search_terms=Day%20Care&geo_location_terms=salt%20lake%20city",
  "proxy": "brd-customer-hl_928b621d-zone-web_unlocker1:u3ya0stcidaa@brd.superproxy.io:33335"
}
```

---

## Teste de Funcionamento

### Testar servidor MCP:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node mcp-server.js
```

### Testar servidor HTTP:
```bash
curl http://localhost:8931/health
```

---

## Troubleshooting

1. **Erro de permissão**: Execute `chmod +x mcp-server.js`
2. **Caminho incorreto**: Ajuste o caminho absoluto no n8n
3. **Dependências**: Execute `npm install` se necessário
4. **Proxy**: Teste primeiro sem proxy, depois com proxy

---

## Configuração de Proxy Bright Data

Para usar com Bright Data:
```
brd-customer-hl_928b621d-zone-web_unlocker1:u3ya0stcidaa@brd.superproxy.io:33335
```

Substitua pelos seus dados:
- `hl_928b621d` → seu customer ID
- `web_unlocker1` → sua zone
- `u3ya0stcidaa` → sua senha 