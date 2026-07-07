#!/usr/bin/env node
/**
 * CARDIMG Viewer Server
 * 
 * Serves the viewer.html on a proper HTTP port.
 * Run on port 3013.
 */

const fs = require('fs')
const path = require('path')
const http = require('http')

const VIEWER_PATH = path.join(__dirname, 'viewer.html')
const PORT = 3013

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/viewer.html') {
    res.setHeader('Content-Type', 'text/html')
    res.writeHead(200)
    res.end(fs.readFileSync(VIEWER_PATH))
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  console.log(`CARDIMG Viewer running on http://localhost:${PORT}`)
})