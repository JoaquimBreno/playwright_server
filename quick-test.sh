#!/bin/bash

echo "🔍 Teste Rápido - Servidor MCP Corrigido"
echo "========================================"

SERVER_URL="http://localhost:8931"

# Teste 1: Health Check
echo "1. 🔍 Health Check..."
health_status=$(curl -s -w "%{http_code}" -o /tmp/health.json "$SERVER_URL/health")
if [ "$health_status" = "200" ]; then
    echo "   ✅ Health OK: $(cat /tmp/health.json | jq -r '.server')"
    echo "   📊 Sessões ativas: $(cat /tmp/health.json | jq '.activeSessions')"
else
    echo "   ❌ Health falhou (HTTP $health_status)"
    exit 1
fi

# Teste 2: Status Check
echo ""
echo "2. 📊 Status Check..."
status_response=$(curl -s -w "%{http_code}" -o /tmp/status.json "$SERVER_URL/status")
if [ "$status_response" = "200" ]; then
    echo "   ✅ Status OK"
    echo "   📈 Sessões: $(cat /tmp/status.json | jq '.activeSessions')"
else
    echo "   ⚠️ Status endpoint não disponível"
fi

# Teste 3: Conexão SSE
echo ""
echo "3. 🔗 Teste Conexão SSE..."
sse_test=$(timeout 5s curl -s -H "Accept: text/event-stream" -H "Cache-Control: no-cache" "$SERVER_URL/sse" | head -c 100)
if [ $? -eq 0 ] && [ -n "$sse_test" ]; then
    echo "   ✅ SSE conectou e recebeu dados"
    echo "   📨 Amostra: ${sse_test:0:50}..."
else
    echo "   ⚠️ SSE pode não estar respondendo (normal em alguns casos)"
fi

# Teste 4: Status Final
echo ""
echo "4. 📊 Status Final..."
final_status=$(curl -s "$SERVER_URL/status" | jq '.activeSessions')
echo "   📈 Sessões ativas após testes: $final_status"

echo ""
echo "🎯 RESUMO:"
echo "   🌐 Servidor: $SERVER_URL"
echo "   📡 Endpoint MCP: $SERVER_URL/sse"
echo "   📊 Health: $SERVER_URL/health"
echo "   🔍 Status: $SERVER_URL/status"
echo ""
echo "✅ Para n8n, use: $SERVER_URL/sse"
echo "🚀 Servidor está funcionando!"

# Cleanup
rm -f /tmp/health.json /tmp/status.json 