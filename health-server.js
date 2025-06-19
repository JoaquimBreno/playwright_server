import http from 'http';

const port = 8932;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      mcp_server: 'http://localhost:8931',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Proxy to MCP server
  if (req.url.startsWith('/sse')) {
    res.writeHead(307, { 'Location': `http://localhost:8931${req.url}` });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`Health check server running at http://localhost:${port}`);
}); 