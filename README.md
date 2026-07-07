# CARDIMG Protocol

Permissionless onchain card image registry for BSV blockchain.

## Protocol

Minimal, image-only format:

```
OP_FALSE OP_RETURN "CARDIMG" <version:1B> <image_data>
```

- **No metadata** on-chain — identity derived from image hash (SHA256)
- **Permissionless** — anyone can upload/read
- All meaning (condition, price, ownership) emerges from applications reading the data

## Components

| File | Purpose |
|------|---------|
| `SPEC.md` | Protocol specification |
| `upload.cjs` | CLI uploader |
| `indexer.cjs` | Jungle Bus indexer |
| `api.cjs` | REST API (port 3012) |
| `viewer.html` | Web viewer |
| `viewer-server.cjs` | Viewer HTTP server (port 3013) |

## Quick Start

```bash
# Install dependencies
npm install

# Start services (PM2)
pm2 start ecosystem.config.js

# Upload image via CLI
node upload.cjs card-image.png

# Upload via web
open http://localhost:3013
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /cards` | List all cards |
| `GET /cards/:hash` | Get card metadata |
| `GET /cards/:hash/image` | Get card image |
| `POST /upload` | Upload new card (multipart) |
| `GET /stats` | Population stats |
| `GET /status` | Indexer status |

## Cost

Approximately $0.04-0.20 per card depending on image size (~0.5 sats/byte).
10MB max upload ≈ $2.00.

## Requirements

- Node.js 18+
- BSV wallet (funded)
- Jungle Bus subscription for indexing

## License

MIT