# Configuração Oficial do Playwright MCP no n8n

## ✅ Servidor Oficial Microsoft Playwright MCP

Agora usando o pacote oficial `@playwright/mcp` da Microsoft seguindo as especificações do [repositório oficial](https://github.com/microsoft/playwright-mcp).

---

## Opção 1: Servidor MCP via STDIO (RECOMENDADO)

### 1. Configuração no n8n:

**No node MCP do n8n, use estas configurações:**

- **Transport Type**: `stdio`
- **Command**: `node`
- **Arguments**: 
  ```
  /Users/moises/Documents/playwright_server/official-mcp-stdio.js
  ```
- **Working Directory**: `/Users/moises/Documents/playwright_server`

### 2. Tools disponíveis (via pacote oficial):

O servidor oficial inclui todos os tools padrão do Playwright MCP:

**Navegação:**
- `browser_navigate` - Navegar para uma URL
- `browser_navigate_back` - Voltar página
- `browser_navigate_forward` - Avançar página

**Interação:**
- `browser_click` - Clicar em elementos
- `browser_type` - Digitar texto
- `browser_hover` - Passar mouse sobre elementos
- `browser_drag` - Arrastar elementos
- `browser_select_option` - Selecionar opções

**Captura:**
- `browser_snapshot` - Capturar snapshot da página
- `browser_take_screenshot` - Tirar screenshot
- `browser_pdf_save` - Salvar como PDF

**Aguardar:**
- `browser_wait_for` - Aguardar condições

**Abas:**
- `browser_tab_list` - Listar abas
- `browser_tab_new` - Nova aba
- `browser_tab_select` - Selecionar aba
- `browser_tab_close` - Fechar aba

**E muito mais!**

---

## Opção 2: Servidor SSE (ALTERNATIVO)

### 1. Manter o servidor rodando:
```bash
node official-mcp-server.js
```

### 2. No n8n, usar MCP node:
- **Transport Type**: `sse` ou `Server-Sent Events`
- **URL**: `http://localhost:8931/sse`

---

## Opção 3: HTTP Request (PARA SCRAPING SIMPLES)

### 1. No n8n, usar HTTP Request node:
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

### Testar servidor MCP stdio:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node official-mcp-stdio.js
```

### Testar servidor SSE:
```bash
curl http://localhost:8931/health
curl -H "Accept: text/event-stream" http://localhost:8931/sse
```

---

## Vantagens do Servidor Oficial

✅ **Compatibilidade total** com o protocolo MCP  
✅ **Todos os tools do Playwright** disponíveis  
✅ **Manutenção oficial** da Microsoft  
✅ **Documentação completa** no GitHub  
✅ **Configuração otimizada** para web scraping  
✅ **Suporte a proxy** nativo  

---

## Exemplo de Uso para YellowPages

### 1. Usar `browser_navigate`:
```json
{
  "url": "https://www.yellowpages.com/search?search_terms=Day%20Care&geo_location_terms=salt%20lake%20city"
}
```

### 2. Usar `browser_snapshot` para capturar conteúdo:
```json
{}
```

### 3. Usar `browser_click` para interações:
```json
{
  "element": "Next page button",
  "ref": "selector-from-snapshot"
}
```

---

## Troubleshooting

1. **Erro de permissão**: Execute `chmod +x official-mcp-*.js`
2. **Caminho incorreto**: Ajuste o caminho absoluto no n8n
3. **Dependências**: Execute `npm install @playwright/mcp`
4. **Porta ocupada**: Mude a porta no código se necessário

---

## Configuração de Proxy

O servidor oficial suporta proxy via argumentos de browser. Para configurar proxy:

1. **Via environment variables**
2. **Via browser launch options** 
3. **Via context options**

Exemplo com Bright Data:
```
brd-customer-hl_928b621d-zone-web_unlocker1:u3ya0stcidaa@brd.superproxy.io:33335
```

---

## Status Atual

- ✅ Pacote oficial `@playwright/mcp` instalado
- ✅ Servidor SSE funcionando na porta 8931
- ✅ Servidor stdio pronto para n8n
- ✅ Todos os tools oficiais disponíveis
- ✅ Configuração otimizada para scraping
- ✅ Suporte completo ao protocolo MCP

**Use preferencialmente a Opção 1 (stdio) para máxima compatibilidade com n8n!** 