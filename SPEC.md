# CARDIMG — Onchain Card Image Registry

**Version:** 1.0  
**Status:** Draft  
**Prefix:** `CARDIMG`

---

## Overview

CARDIMG is a minimal protocol for storing card images on the BSV blockchain. It serves as an immutable, permissionless database of card scans and photos.

**Core principle:** The protocol stores images. Nothing else. All meaning (identity, condition, ownership, value) emerges from applications that read and interpret this data.

---

## Transaction Format

### Single-Output Image

```
OP_FALSE OP_RETURN "CARDIMG" <version> <image_data>
```

| Field | Size | Description |
|-------|------|-------------|
| `CARDIMG` | 7 bytes | Protocol identifier |
| `version` | 1 byte | Protocol version (0x01) |
| `image_data` | variable | Raw image bytes |

### Multi-Output Image (Large Files)

For images exceeding single-output limits, use pushdata chunks:

```
OP_FALSE OP_RETURN "CARDIMG" <version> <chunk_index> <total_chunks> <image_chunk>
```

| Field | Size | Description |
|-------|------|-------------|
| `CARDIMG` | 7 bytes | Protocol identifier |
| `version` | 1 byte | Protocol version (0x01) |
| `chunk_index` | 4 bytes | Zero-indexed chunk number (little-endian) |
| `total_chunks` | 4 bytes | Total number of chunks (little-endian) |
| `image_chunk` | variable | Image data chunk |

**Chunk reassembly:** Concatenate chunks in order by `chunk_index` to reconstruct full image.

---

## Image Format

**No format restriction.** The protocol accepts any image format:

- JPEG
- PNG
- WebP
- HEIC
- Any other binary image data

**Rationale:** 
- Indexers can detect format from magic bytes
- Uploader chooses optimal format for their use case
- No protocol-level opinion on "correct" format

**Recommendation (non-normative):**
- JPEG for photos (smaller size)
- PNG for scans (lossless)
- WebP for modern efficiency

---

## No Metadata

The protocol stores **only image data**. No:

- Card name
- Set identifier
- Condition/grade
- Owner address
- Timestamp (use block height instead)
- Any other metadata

**Why:**
- Metadata introduces subjectivity (who names the card? who assigns grade?)
- The image is the ground truth; interpretation is application-layer
- Simplicity enables permissionless innovation

---

## Identity

A card's identity is derived from its image, not assigned by the protocol:

- **Image hash:** `SHA256(image_data)` — unique identifier for exact image
- **Perceptual hash:** Application-derived fingerprint for matching similar images
- **Block height + TXID:** Proof of existence at a point in time

The protocol does not enforce uniqueness. Multiple uploads of the same image are valid transactions. Deduplication is an application-layer concern.

---

## Cost Estimation

At ~0.5 sats/byte (typical BSV fee rate):

| Image Size | Cost (sats) | Cost (~$40/BSV) |
|------------|-------------|-----------------|
| 200 KB | 100,000 | ~$0.04 |
| 500 KB | 250,000 | ~$0.10 |
| 1 MB | 500,000 | ~$0.20 |
| 2 MB | 1,000,000 | ~$0.40 |

---

## Indexing

To index all CARDIMG transactions:

1. Scan blockchain for OP_RETURN outputs
2. Match first pushdata = `CARDIMG` (0x43415244494D47)
3. Parse version byte
4. If `chunk_index` present: buffer chunk, reassemble when complete
5. If single-output: extract `image_data` directly
6. Compute `SHA256(image_data)` for identity

---

## Discovery

**Protocol prefix (hex):** `43415244494D47` (ASCII: "CARDIMG")

**Version byte:** `01`

**Example transaction:**
```
OP_FALSE OP_RETURN 
  43415244494D47    // "CARDIMG"
  01                // version 1
  <image_bytes>     // raw image data
```

---

## Applications (Non-Normative)

The protocol intentionally does not define these. Examples of what can be built:

| Application | Description |
|-------------|-------------|
| **Authentication** | Compare scan against registered images |
| **Grading** | AI analysis of image condition |
| **Population report** | Count unique cards by perceptual matching |
| **Marketplace** | Build transfer layer on top |
| **Provenance** | Track image history (not protocol-defined) |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-07 | Initial draft |

---

## License

Public domain. Use freely.