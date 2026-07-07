#!/usr/bin/env node
/**
 * CARDIMG Indexer — Jungle Bus Listener
 * 
 * Indexes all CARDIMG protocol transactions from BSV blockchain.
 * Stores image data and metadata in local JSON ledger.
 * 
 * Usage:
 *   node indexer.cjs              # Start indexing from latest
 *   node indexer.cjs --scan       # Full scan from block 771000
 *   node indexer.cjs --status     # Show current index status
 */

// Node.js localStorage polyfill (required by js-junglebus)
const _store = {}
const _ls = {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v) },
  removeItem: k => { delete _store[k] },
  clear: () => { for (const k in _store) delete _store[k] },
  get length() { return Object.keys(_store).length },
  key: i => Object.keys(_store)[i] ?? null
}
try { Object.defineProperty(globalThis, 'localStorage', { value: _ls, writable: true, configurable: true }) } catch { globalThis.localStorage = _ls }

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Jungle Bus SDK
const { JungleBusClient } = require('@gorillapool/js-junglebus')

const LEDGER_PATH = path.join(__dirname, 'ledger.json')
const PROTOCOL_PREFIX = 'CARDIMG'
const PROTOCOL_PREFIX_HEX = '43415244494d47' // "CARDIMG" in hex

// Initialize ledger
function initLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify({
      cards: {},
      txids: [],
      lastBlock: 0,
      totalImages: 0,
      totalBytes: 0,
      created: new Date().toISOString()
    }, null, 2))
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'))
}

function saveLedger(ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2))
}

// Parse pushdata from buffer at offset
function parsePushData(buffer, offset) {
  const pushByte = buffer[offset]
  
  if (pushByte <= 0x4b) {
    // Direct push (1-75 bytes)
    const len = pushByte
    return {
      data: buffer.slice(offset + 1, offset + 1 + len),
      nextOffset: offset + 1 + len
    }
  } else if (pushByte === 0x4c) {
    // OP_PUSHDATA1
    const len = buffer[offset + 1]
    return {
      data: buffer.slice(offset + 2, offset + 2 + len),
      nextOffset: offset + 2 + len
    }
  } else if (pushByte === 0x4d) {
    // OP_PUSHDATA2
    const len = buffer.readInt16LE(offset + 1)
    return {
      data: buffer.slice(offset + 3, offset + 3 + len),
      nextOffset: offset + 3 + len
    }
  } else if (pushByte === 0x4e) {
    // OP_PUSHDATA4
    const len = buffer.readInt32LE(offset + 1)
    return {
      data: buffer.slice(offset + 5, offset + 5 + len),
      nextOffset: offset + 5 + len
    }
  }
  
  return null
}

// Parse CARDIMG from raw tx hex
function parseCardImg(txHex) {
  const txBuffer = Buffer.from(txHex, 'hex')
  
  // Scan for OP_FALSE OP_RETURN pattern
  let offset = 0
  
  while (offset < txBuffer.length - 50) {
    // Look for OP_FALSE OP_RETURN
    if (txBuffer[offset] === 0x00 && txBuffer[offset + 1] === 0x6a) {
      // Parse first pushdata (should be CARDIMG)
      const prefixPush = parsePushData(txBuffer, offset + 2)
      if (!prefixPush) { offset++; continue }
      
      const prefix = prefixPush.data.toString('ascii')
      if (prefix !== 'CARDIMG') { offset++; continue }
      
      // Found CARDIMG! Parse version
      const versionPush = parsePushData(txBuffer, prefixPush.nextOffset)
      if (!versionPush) { offset++; continue }
      
      const version = versionPush.data[0]
      
      // Parse image data
      const imagePush = parsePushData(txBuffer, versionPush.nextOffset)
      if (!imagePush) { offset++; continue }
      
      return {
        prefix,
        version,
        imageData: imagePush.data,
        imageHash: crypto.createHash('sha256').update(imagePush.data).digest('hex'),
        imageLen: imagePush.data.length
      }
    }
    offset++
  }
  
  return null
}

// Detect image format from magic bytes
function detectFormat(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'JPEG'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'PNG'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // RIFF container - check for WebP
    if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'WebP'
    return 'RIFF'
  }
  return 'unknown'
}

// WoC API helpers
const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'

async function fetchTxHex(txid) {
  const response = await fetch(`${WoC_API}/tx/${txid}/hex`)
  if (!response.ok) throw new Error(`WoC error: ${response.status}`)
  return response.text()
}

async function searchByPrefix(prefixHex, blockHeight = 771000) {
  // WoC doesn't have prefix search directly, use script hash filter
  // Alternative: scan known CARDIMG txids or use Jungle Bus
  console.log('Searching for CARDIMG transactions...')
  
  // For now, return empty - Jungle Bus is the proper solution
  return []
}

// Jungle Bus subscription ID (set in env or use this default)
const JB_SUB_ID = process.env.JB_SUB_ID || 'f25086265e0adc867a6a45f51a8f1be63bf79fc19355513543d1c704c461889a'

// Jungle Bus connection
async function connectJungleBus(ledger) {
  console.log('Connecting to Jungle Bus...')
  console.log('Subscription:', JB_SUB_ID)
  
  const jungle = new JungleBusClient('junglebus.gorillapool.io', {
    onConnected(ctx) { console.log('[junglebus] connected') },
    onConnecting() { console.log('[junglebus] connecting...') },
    onDisconnected(ctx) { console.log('[junglebus] disconnected') },
    onError(ctx) { console.error('[junglebus] connection error:', ctx) }
  })
  
  const fromBlock = ledger.lastBlock > 0 ? ledger.lastBlock + 1 : 771000
  
  console.log(`Starting from block ${fromBlock}...`)
  
  // Callbacks for Subscribe
  const onPublish = async (tx) => {
    try {
      const txHex = await fetchTxHex(tx.id)
      const cardImg = parseCardImg(txHex)
      
      if (cardImg) {
        ledger.cards[cardImg.imageHash] = {
          txid: tx.id,
          blockHeight: tx.block_height,
          version: cardImg.version,
          format: detectFormat(cardImg.imageData),
          size: cardImg.imageLen,
          indexed: new Date().toISOString()
        }
        
        ledger.txids.push(tx.id)
        ledger.totalImages++
        ledger.totalBytes += cardImg.imageLen
        ledger.lastBlock = Math.max(ledger.lastBlock || 0, tx.block_height)
        
        saveLedger(ledger)
        console.log(`✓ Indexed: ${tx.id} (${cardImg.imageLen}B, block ${tx.block_height})`)
      }
    } catch (e) {
      console.error('Error:', tx.id, e.message)
    }
  }
  
  const onStatus = (ctx) => {
    console.log('[status]', ctx)
    if (ctx.block_height) {
      ledger.lastBlock = ctx.block_height
      saveLedger(ledger)
    }
  }
  
  const onError = (ctx) => {
    console.error('[error]', ctx)
  }
  
  const onMempool = async (tx) => {
    console.log('[mempool]', tx.id)
    onPublish(tx)
  }
  
  // Subscribe with the configured subscription ID
  await jungle.Subscribe(JB_SUB_ID, fromBlock, onPublish, onStatus, onError, onMempool)
  
  return jungle
}

// WoC fallback scan (slow, for testing without JB API key)
async function indexWithWoC(ledger) {
  console.log('Using WoC fallback (no real-time indexing)')
  
  // For testing: manually check known CARDIMG txid
  const knownTxid = '3e4235b5469d9af0658e3a913418f438cb233f9ee11fb9fbf6a04701d8c4c8fa'
  
  if (!ledger.txids.includes(knownTxid)) {
    console.log('Checking known CARDIMG:', knownTxid)
    
    try {
      const txHex = await fetchTxHex(knownTxid)
      const cardImg = parseCardImg(txHex)
      
      if (cardImg) {
        ledger.cards[cardImg.imageHash] = {
          txid: knownTxid,
          blockHeight: null, // Would need WoC block info
          version: cardImg.version,
          format: detectFormat(cardImg.imageData),
          size: cardImg.imageLen,
          indexed: new Date().toISOString()
        }
        
        ledger.txids.push(knownTxid)
        ledger.totalImages++
        ledger.totalBytes += cardImg.imageLen
        
        saveLedger(ledger)
        
        console.log(`Indexed: ${knownTxid} (${cardImg.imageLen} bytes, ${cardImg.imageHash})`)
      }
    } catch (e) {
      console.error('Error:', e.message)
    }
  }
  
  console.log('Index complete (WoC fallback mode)')
}

// Status display
function showStatus(ledger) {
  console.log('')
  console.log('=== CARDIMG Index Status ===')
  console.log(`Total images:  ${ledger.totalImages}`)
  console.log(`Total bytes:   ${ledger.totalBytes} (${(ledger.totalBytes / 1024).toFixed(1)} KB)`)
  console.log(`Last block:    ${ledger.lastBlock}`)
  console.log(`Unique hashes: ${Object.keys(ledger.cards).length}`)
  console.log(`Created:       ${ledger.created}`)
  console.log('')
  console.log('Recent uploads:')
  
  const recent = ledger.txids.slice(-5)
  for (const txid of recent) {
    const card = Object.values(ledger.cards).find(c => c.txid === txid)
    if (card) {
      console.log(`  ${txid} - ${card.format} ${card.size}B`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const showStatusOnly = args.includes('--status')
  const fullScan = args.includes('--scan')
  
  const ledger = initLedger()
  
  if (showStatusOnly) {
    showStatus(ledger)
    process.exit(0)
  }
  
  // Try Jungle Bus first
  const jungle = await connectJungleBus(ledger)
  
  if (!jungle) {
    // WoC fallback
    await indexWithWoC(ledger)
    showStatus(ledger)
  }
  
  // If Jungle Bus connected, it runs continuously
  console.log('Listening for new CARDIMG transactions...')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})