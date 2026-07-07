#!/usr/bin/env node
/**
 * CARDIMG Uploader — Prototype
 * 
 * Uploads a card image to BSV blockchain using the CARDIMG protocol.
 * 
 * Usage:
 *   node upload.cjs <image_path>
 *   node upload.cjs card.jpg --tx    (show TX hex without broadcasting)
 *   node upload.cjs card.jpg --fee   (estimate fee only)
 */

const fs = require('fs')
const path = require('path')
const bsv = require('bsv')

// Constants
const PROTOCOL_PREFIX = Buffer.from('CARDIMG')
const VERSION = Buffer.from([0x01])
const SATS_PER_BYTE = 0.5 // typical fee rate
const MAX_OUTPUT_SIZE = 100000 // ~100KB per output (safe limit)

// Load wallet
const WALLET_PATH = path.join(process.env.HOME || '/root', '.openclaw', 'bsv-wallet.json')

function loadWallet() {
  if (!fs.existsSync(WALLET_PATH)) {
    console.error('Wallet not found at:', WALLET_PATH)
    console.error('Run: bsv wallet create')
    process.exit(1)
  }
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'))
  return {
    privateKey: bsv.PrivateKey.fromWIF(walletData.wif),
    address: bsv.Address.fromString(walletData.address)
  }
}

function getImageInfo(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath)
  const ext = path.extname(imagePath).toLowerCase()
  
  // Detect format from magic bytes
  let format = 'unknown'
  if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) format = 'JPEG'
  else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) format = 'PNG'
  else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) format = 'WebP'
  else if (imageBuffer[0] === 0x00 && imageBuffer[1] === 0x00) {
    // HEIC starts differently, check further
    if (imageBuffer[4] === 0x66 && imageBuffer[5] === 0x74) format = 'HEIC'
  }
  
  return {
    buffer: imageBuffer,
    size: imageBuffer.length,
    format,
    ext
  }
}

function calculateFee(imageSize) {
  // OP_FALSE OP_RETURN "CARDIMG" <version> <image_data>
  // Overhead: OP_FALSE (1) + OP_RETURN (1) + length byte + prefix (7) + version (1) + length bytes for image
  // Approximate: 20 bytes overhead + image size
  const overhead = 20
  const totalBytes = overhead + imageSize
  return Math.ceil(totalBytes * SATS_PER_BYTE)
}

function buildTransaction(imageBuffer, wallet, utxos) {
  const tx = new bsv.Transaction()
  
  // Add inputs (UTXOs)
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
  
  // Build OP_RETURN output
  const script = bsv.Script.buildSafeDataOut([
    PROTOCOL_PREFIX,
    VERSION,
    imageBuffer
  ])
  
  // Calculate fee
  const fee = calculateFee(imageBuffer.length)
  
  // Add OP_RETURN output (0 satoshis)
  tx.addOutput(new bsv.Transaction.Output({
    script: script,
    satoshis: 0
  }))
  
  // Add change output
  const changeSats = inputSats - fee
  if (changeSats < 0) {
    console.error(`Insufficient funds: need ${fee} sats, have ${inputSats} sats`)
    process.exit(1)
  }
  
  if (changeSats > 546) { // dust limit
    tx.change(wallet.address)
  }
  
  // Sign
  tx.sign(wallet.privateKey)
  
  return { tx, fee, changeSats }
}

async function fetchUtxos(address) {
  const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'
  const response = await fetch(`${WoC_API}/address/${address}/unspent`)
  
  if (!response.ok) {
    throw new Error(`WoC API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Filter for low-value UTXOs suitable for small transactions
  return data
    .filter(u => u.value > 1000) // skip dust
    .sort((a, b) => a.value - b.value) // smallest first
    .map(u => ({
      txid: u.tx_hash,
      vout: u.tx_pos,
      satoshis: u.value
    }))
}

async function broadcastTx(txHex) {
  const WoC_API = 'https://api.whatsonchain.com/v1/bsv/main'
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

function computeImageHash(imageBuffer) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(imageBuffer).digest('hex')
}

async function main() {
  const args = process.argv.slice(2)
  const imagePath = args.find(a => !a.startsWith('--'))
  const dryRun = args.includes('--tx')
  const feeOnly = args.includes('--fee')
  
  if (!imagePath) {
    console.log('Usage: node upload.cjs <image_path> [--tx] [--fee]')
    console.log('')
    console.log('Options:')
    console.log('  --tx   Show TX hex without broadcasting')
    console.log('  --fee  Estimate fee only')
    process.exit(1)
  }
  
  if (!fs.existsSync(imagePath)) {
    console.error('File not found:', imagePath)
    process.exit(1)
  }
  
  // Load wallet
  const wallet = loadWallet()
  console.log('Wallet:', wallet.address.toString())
  
  // Load image
  const image = getImageInfo(imagePath)
  console.log('Image:', image.format, `${(image.size / 1024).toFixed(1)}KB`)
  console.log('Hash:', computeImageHash(image.buffer))
  
  // Calculate fee
  const fee = calculateFee(image.size)
  console.log('Est. fee:', fee, 'sats')
  
  if (image.size > MAX_OUTPUT_SIZE) {
    console.log('Note: Image > 100KB, chunking not yet implemented')
    console.log('For large images, consider compressing first')
  }
  
  if (feeOnly) {
    console.log(`\nEstimated cost: ${fee} sats (~$${(fee / 100000000 * 40).toFixed(4)} at $40/BSV)`)
    process.exit(0)
  }
  
  // Fetch UTXOs
  console.log('\nFetching UTXOs...')
  const utxos = await fetchUtxos(wallet.address)
  console.log('Found', utxos.length, 'UTXOs')
  
  if (utxos.length === 0) {
    console.error('No UTXOs found. Fund wallet first.')
    process.exit(1)
  }
  
  // Build transaction
  console.log('Building transaction...')
  const { tx, fee: actualFee, changeSats } = buildTransaction(image.buffer, wallet, utxos)
  
  console.log('TX size:', tx.serialize().length / 2, 'bytes')
  console.log('Fee:', actualFee, 'sats')
  console.log('Change:', changeSats, 'sats')
  
  if (dryRun) {
    console.log('\n--- TX HEX ---')
    console.log(tx.serialize())
    console.log('--------------')
    process.exit(0)
  }
  
  // Broadcast
  console.log('\nBroadcasting...')
  const txid = await broadcastTx(tx.serialize())
  
  console.log('\n✓ Success!')
  console.log('TXID:', txid)
  console.log('Explorer:', `https://whatsonchain.com/tx/${txid}`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})