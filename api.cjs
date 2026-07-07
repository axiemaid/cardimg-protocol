#!/usr/bin/env node
/**
 * CARDIMG API Server
 * 
 * Serves indexed card data from ledger.json via REST API.
 * Fetches and caches images from blockchain on demand.
 * 
 * Usage: node api.cjs [--port 3012]
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const bsv = require('bsv')

const LEDGER_PATH = path.join(__dirname, 'ledger.json')
const IMAGES_PATH = path.join(__dirname, 'images')
const WALLET_PATH = path.join(process.env.HOME || '/root', '.openclaw', 'bsv-wallet.json')
const PORT = process.env.PORT || 3012
const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'
const MAX_IMAGE_SIZE = 10000000 // 10MB

// Ensure images folder exists
if (!fs.existsSync(IMAGES_PATH)) {
  fs.mkdirSync(IMAGES_PATH, { recursive: true })
}

// Load wallet
function loadWallet() {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error('Wallet not found at ' + WALLET_PATH)
  }
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'))
  return {
    privateKey: bsv.PrivateKey.fromWIF(walletData.wif),
    address: bsv.Address.fromString(walletData.address)
  }
}

// Load ledger
function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return {
      cards: {},
      txids: [],
      lastBlock: 0,
      totalImages: 0,
      totalBytes: 0,
      created: new Date().toISOString()
    }
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'))
}

// Parse pushdata from buffer at offset
function parsePushData(buffer, offset) {
  const pushByte = buffer[offset]
  
  if (pushByte <= 0x4b) {
    const len = pushByte
    return {
      data: buffer.slice(offset + 1, offset + 1 + len),
      nextOffset: offset + 1 + len
    }
  } else if (pushByte === 0x4c) {
    const len = buffer[offset + 1]
    return {
      data: buffer.slice(offset + 2, offset + 2 + len),
      nextOffset: offset + 2 + len
    }
  } else if (pushByte === 0x4d) {
    const len = buffer.readInt16LE(offset + 1)
    return {
      data: buffer.slice(offset + 3, offset + 3 + len),
      nextOffset: offset + 3 + len
    }
  } else if (pushByte === 0x4e) {
    const len = buffer.readInt32LE(offset + 1)
    return {
      data: buffer.slice(offset + 5, offset + 5 + len),
      nextOffset: offset + 5 + len
    }
  }
  return null
}

// Extract image from CARDIMG transaction
function extractImageFromTx(txHex) {
  const txBuffer = Buffer.from(txHex, 'hex')
  
  // Scan for OP_FALSE OP_RETURN pattern
  let offset = 0
  
  while (offset < txBuffer.length - 50) {
    if (txBuffer[offset] === 0x00 && txBuffer[offset + 1] === 0x6a) {
      // Parse first pushdata (should be CARDIMG)
      const prefixPush = parsePushData(txBuffer, offset + 2)
      if (!prefixPush) { offset++; continue }
      
      const prefix = prefixPush.data.toString('ascii')
      if (prefix !== 'CARDIMG') { offset++; continue }
      
      // Parse version push
      const versionPush = parsePushData(txBuffer, prefixPush.nextOffset)
      if (!versionPush) { offset++; continue }
      
      // Parse image push
      const imagePush = parsePushData(txBuffer, versionPush.nextOffset)
      if (!imagePush) { offset++; continue }
      
      return imagePush.data
    }
    offset++
  }
  
  return null
}

// Fetch image from chain or cache
async function fetchImage(hash, txid) {
  // Check cache first
  const cachedPath = path.join(IMAGES_PATH, `${hash}.bin`)
  
  if (fs.existsSync(cachedPath)) {
    console.log(`[cache] Serving cached image for ${hash}`)
    return fs.readFileSync(cachedPath)
  }
  
  // Fetch from WoC
  console.log(`[chain] Fetching image from chain: ${txid}`)
  
  const response = await fetch(`${WoC_API}/tx/${txid}/hex`)
  if (!response.ok) {
    throw new Error(`WoC error: ${response.status}`)
  }
  
  const txHex = await response.text()
  const imageBuffer = extractImageFromTx(txHex)
  
  if (!imageBuffer) {
    throw new Error('Could not extract image from tx')
  }
  
  // Save to cache
  fs.writeFileSync(cachedPath, imageBuffer)
  console.log(`[cache] Saved image to ${cachedPath}`)
  
  return imageBuffer
}

// Fetch UTXOs from WoC
async function fetchUtxos(address) {
  const response = await fetch(`${WoC_API}/address/${address}/unspent`)
  if (!response.ok) throw new Error(`WoC UTXO error: ${response.status}`)
  const data = await response.json()
  return data
    .filter(u => u.value > 1000)
    .sort((a, b) => a.value - b.value)
    .map(u => ({
      txid: u.tx_hash,
      vout: u.tx_pos,
      satoshis: u.value
    }))
}

// Broadcast transaction
async function broadcastTx(txHex) {
  const response = await fetch(`${WoC_API}/tx/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txhex: txHex })
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Broadcast failed: ${response.status} - ${text}`)
  }
  return response.text()
}

// Build and broadcast upload transaction
async function uploadImage(imageBuffer) {
  const wallet = loadWallet()
  console.log('[upload] Using wallet:', wallet.address.toString())
  
  // Fetch UTXOs
  const utxos = await fetchUtxos(wallet.address)
  if (utxos.length === 0) throw new Error('No UTXOs available')
  console.log('[upload] Found', utxos.length, 'UTXOs')
  
  // Build transaction
  const tx = new bsv.Transaction()
  
  // Add inputs first (important for bsv library order)
  let inputSats = 0
  for (const utxo of utxos) {
    tx.from({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      script: bsv.Script.buildPublicKeyHashOut(wallet.address).toHex(),
      satoshis: utxo.satoshis
    })
    inputSats += utxo.satoshis
  }
  
  // Build CARDIMG OP_RETURN
  const PROTOCOL_PREFIX = Buffer.from('CARDIMG')
  const VERSION = Buffer.from([0x01])
  
  const script = bsv.Script.buildSafeDataOut([
    PROTOCOL_PREFIX,
    VERSION,
    imageBuffer
  ])
  
  // Add OP_RETURN output (0 satoshis)
  tx.addOutput(new bsv.Transaction.Output({
    script: script,
    satoshis: 0
  }))
  
  // Calculate fee
  const overhead = 20
  const fee = Math.ceil((overhead + imageBuffer.length) * 0.5)
  
  // Calculate change
  const changeSats = inputSats - fee
  
  if (changeSats < 0) {
    throw new Error(`Insufficient funds: need ${fee} sats, have ${inputSats}`)
  }
  
  // Set change address if above dust limit
  if (changeSats > 546) {
    tx.change(wallet.address)
  }
  
  // Sign
  tx.sign(wallet.privateKey)
  
  const txHex = tx.serialize()
  
  console.log('[upload] TX size:', txHex.length / 2, 'bytes')
  console.log('[upload] Fee:', fee, 'sats')
  
  // Broadcast
  const txid = await broadcastTx(txHex)
  console.log('[upload] Broadcast successful:', txid)
  
  // Compute hash
  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex')
  
  // Cache image
  const cachedPath = path.join(IMAGES_PATH, `${hash}.bin`)
  fs.writeFileSync(cachedPath, imageBuffer)
  
  return {
    txid: txid.replace(/"/g, ''),
    hash,
    size: imageBuffer.length,
    format: detectFormat(imageBuffer)
  }
}

// Parse multipart form data (simple implementation)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type']
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return reject(new Error('Expected multipart/form-data'))
    }
    
    const boundary = contentType.split('boundary=')[1]
    if (!boundary) return reject(new Error('No boundary found'))
    
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      
      // Find file data between boundaries
      const boundaryStart = Buffer.from('--' + boundary)
      const boundaryEnd = Buffer.from('--' + boundary + '--')
      
      // Find Content-Type: image/... and extract data after it
      const lines = buffer.toString().split('\r\n')
      let imageData = null
      let start = false
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Content-Type: image')) {
          start = true
          continue
        }
        if (start && lines[i] === '') {
          // Next line is the start of image data
          // Find the actual binary data in buffer
          const startMarker = Buffer.from('\r\n\r\n')
          const startIdx = buffer.indexOf(startMarker) + startMarker.length
          const endIdx = buffer.indexOf(Buffer.from('\r\n--' + boundary))
          if (startIdx > 0 && endIdx > startIdx) {
            imageData = buffer.slice(startIdx, endIdx)
          }
          break
        }
      }
      
      if (imageData) {
        resolve(imageData)
      } else {
        reject(new Error('Could not extract image data'))
      }
    })
    req.on('error', reject)
  })
}

// Detect format from magic bytes
function detectFormat(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG'
  return 'unknown'
}

// Detect image MIME type from magic bytes
function detectMimeType(buffer) {
  const format = detectFormat(buffer)
  if (format === 'JPEG') return 'image/jpeg'
  if (format === 'PNG') return 'image/png'
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}

// Stats computation
function computeStats(ledger) {
  const formats = {}
  const sizes = []
  
  for (const card of Object.values(ledger.cards)) {
    formats[card.format] = (formats[card.format] || 0) + 1
    sizes.push(card.size)
  }
  
  return {
    total: ledger.totalImages,
    totalBytes: ledger.totalBytes,
    avgSize: sizes.length > 0 ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
    formats,
    lastBlock: ledger.lastBlock
  }
}

// HTTP server
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0]
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }
  
  try {
    const ledger = loadLedger()
    
    // List all cards
    if (url === '/cards') {
      const cards = Object.entries(ledger.cards).map(([hash, data]) => ({
        hash,
        ...data
      }))
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({ cards, total: cards.length }, null, 2))
      return
    }
    
    // Population stats
    if (url === '/stats') {
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify(computeStats(ledger), null, 2))
      return
    }
    
    // Recent uploads
    if (url === '/recent') {
      const cards = Object.entries(ledger.cards)
        .map(([hash, data]) => ({ hash, ...data }))
        .sort((a, b) => new Date(b.indexed) - new Date(a.indexed))
        .slice(0, 10)
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({ recent: cards }, null, 2))
      return
    }
    
    // Status
    if (url === '/status') {
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({
        indexer: 'running',
        totalCards: ledger.totalImages,
        lastBlock: ledger.lastBlock,
        created: ledger.created
      }, null, 2))
      return
    }
    
    // Get single card
    const cardMatch = url.match(/^\/cards\/([a-f0-9]{64})$/)
    if (cardMatch) {
      const hash = cardMatch[1]
      const card = ledger.cards[hash]
      
      if (!card) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }
      
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200)
      res.end(JSON.stringify({ hash, ...card }, null, 2))
      return
    }
    
    // Get card image
    const imageMatch = url.match(/^\/cards\/([a-f0-9]{64})\/image$/)
    if (imageMatch) {
      const hash = imageMatch[1]
      const card = ledger.cards[hash]
      
      if (!card) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(404)
        res.end(JSON.stringify({ error: 'Card not found' }))
        return
      }
      
      try {
        const imageBuffer = await fetchImage(hash, card.txid)
        const mimeType = detectMimeType(imageBuffer)
        
        res.setHeader('Content-Type', mimeType)
        res.setHeader('Content-Length', imageBuffer.length)
        res.writeHead(200)
        res.end(imageBuffer)
      } catch (e) {
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
      return
    }
    
    // Upload new card image
    if (url === '/upload' && req.method === 'POST') {
      try {
        const imageBuffer = await parseMultipart(req)
        
        // Check size limit
        if (imageBuffer.length > MAX_IMAGE_SIZE) {
          res.setHeader('Content-Type', 'application/json')
          res.writeHead(400)
          res.end(JSON.stringify({ error: `Image too large: ${imageBuffer.length} bytes (max ${MAX_IMAGE_SIZE})` }))
          return
        }
        
        console.log('[upload] Received image:', imageBuffer.length, 'bytes')
        
        // Upload to chain
        const result = await uploadImage(imageBuffer)
        
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(200)
        res.end(JSON.stringify({
          success: true,
          txid: result.txid,
          hash: result.hash,
          size: result.size,
          format: result.format,
          explorer: `https://whatsonchain.com/tx/${result.txid}`
        }, null, 2))
      } catch (e) {
        console.error('[upload] Error:', e.message)
        res.setHeader('Content-Type', 'application/json')
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
      return
    }
    
    // Not found
    res.setHeader('Content-Type', 'application/json')
    res.writeHead(404)
    res.end(JSON.stringify({ 
      error: 'Not found', 
      endpoints: ['/cards', '/cards/:hash', '/cards/:hash/image', '/upload (POST)', '/stats', '/recent', '/status']
    }))
    
  } catch (e) {
    res.setHeader('Content-Type', 'application/json')
    res.writeHead(500)
    res.end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, () => {
  console.log(`CARDIMG API running on http://localhost:${PORT}`)
  console.log('Endpoints:')
  console.log('  GET /cards              - List all cards')
  console.log('  GET /cards/:hash        - Get card by hash')
  console.log('  GET /cards/:hash/image  - Get card image (from chain/cache)')
  console.log('  POST /upload            - Upload new card image')
  console.log('  GET /stats              - Population stats')
  console.log('  GET /recent             - Latest uploads')
  console.log('  GET /status             - Indexer status')
})