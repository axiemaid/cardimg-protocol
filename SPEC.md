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

# CARDSET — Onchain Card Image Set Registry

**Version:** 1.0  
**Status:** Draft  
**Prefix:** `CARDSET`

---

## Overview

CARDSET is a companion protocol to CARDIMG that links multiple card images together as a single set. A physical card typically has multiple views (front, back, side, angles) — CARDSET provides an immutable, permissionless way to declare these images belong to the same card.

**Core principle:** CARDSET stores only hash references. No metadata about the card, set name, or relationship types.

---

## Transaction Format

```
OP_FALSE OP_RETURN "CARDSET" <version> <cardimg_hash_1> <cardimg_hash_2> ... <cardimg_hash_n>
```

| Field | Size | Description |
|-------|------|-------------|
| `CARDSET` | 7 bytes | Protocol identifier |
| `version` | 1 byte | Protocol version (0x01) |
| `cardimg_hash_n` | 32 bytes each | SHA256 hash of CARDIMG image data |

### Example (3-image set)

```
OP_FALSE OP_RETURN
  43415244534554    // "CARDSET"
  01                // version 1
  <hash_1: 32B>     // front image hash
  <hash_2: 32B>     // back image hash
  <hash_3: 32B>     // side image hash
```

---

## Set Identity

A CARDSET's identity is derived from its member hashes:

- **Set hash:** `SHA256(concat(cardimg_hash_1 + cardimg_hash_2 + ... + cardimg_hash_n))`
- This provides a unique identifier for the set

---

## Constraints

| Constraint | Value | Notes |
|------------|-------|-------|
| Max hashes | ~3,000 | Limited by OP_RETURN size (~100KB) |
| Min hashes | 2 | A "set" requires at least 2 images |
| Duplicate hashes | Allowed | Same hash twice = same image appears twice in set |
| Hash validity | Not enforced | Protocol accepts any 32-byte value; application-layer to verify |

---

## No Metadata

CARDSET stores **only hash references**. No:

- Card name
- Set name or label
- Relationship types (front/back/side)
- Owner address
- Order (hashes are unordered by protocol; order is application-derived)

**Why:**
- "Front" vs "back" is subjective — some cards have no clear front
- Naming introduces language/locale opinions
- The hashes are the ground truth; interpretation is application-layer

---

## Validity Rules

1. **Hash format:** Each hash must be exactly 32 bytes (SHA256 output)
2. **Minimum members:** At least 2 hashes required
3. **No self-reference:** A CARDSET cannot reference its own TXID (implicit)
4. **Duplicate CARDIMG:** Protocol allows multiple CARDSETs referencing the same CARDIMG hash
   - This is permissionless — anyone can create a set
   - Application-layer decides which sets are "canonical"

---

## Canonicality

Since anyone can create a CARDSET, there is no protocol-level enforcement of "correct" sets. Application-layer approaches:

| Approach | Description |
|----------|-------------|
| **First-set wins** | Earliest CARDSET for a given hash is canonical |
| **Multi-set aggregation** | Show all sets; user chooses |
| **Signature proof** | CARDSET includes uploader signature (future extension) |
| **Market consensus** | Most-referenced set wins |

These are application-layer decisions. The protocol remains neutral.

---

## Indexing

To index CARDSET transactions:

1. Scan blockchain for OP_RETURN outputs
2. Match first pushdata = `CARDSET` (0x43415244534554)
3. Parse version byte
4. Extract all 32-byte hash values
5. Compute set hash: `SHA256(concat(all_hashes))`
6. Cross-reference with CARDIMG ledger to resolve image metadata

### Query Patterns

| Query | Method |
|-------|--------|
| Find sets containing hash X | Filter all CARDSETs where X appears in hash list |
| Get all images in set Y | Retrieve all hashes from CARDSET Y, lookup CARDIMG |
| Find all sets | List all CARDSET transactions |

---

## Discovery

**Protocol prefix (hex):** `43415244534554` (ASCII: "CARDSET")

**Version byte:** `01`

---

## Relationship to CARDIMG

| Protocol | Purpose |
|----------|---------|
| CARDIMG | Stores images (standalone) |
| CARDSET | Links CARDIMG hashes together |

**Dependencies:**
- CARDIMG can exist without CARDSET (unlinked image)
- CARDSET cannot exist without CARDIMG hashes (references required)
- CARDSET does not modify CARDIMG (pure reference)

**Workflow:**
```
1. Upload images → CARDIMG transactions → hashes
2. Create set → CARDSET transaction → [hash_1, hash_2, ...]
3. Verify → Application checks hashes exist in CARDIMG ledger
```

---

## Cost Estimation

At ~0.5 sats/byte:

| Set Size | Data Size | Cost (sats) | Cost (~$40/BSV) |
|----------|-----------|-------------|-----------------|
| 2 images | ~80 bytes | 40 | ~$0.0002 |
| 5 images | ~170 bytes | 85 | ~$0.0003 |
| 10 images | ~330 bytes | 165 | ~$0.0007 |

CARDSET transactions are very cheap — only hash data, no images.

---

## Future Extensions (Non-Normative)

Potential future versions may include:

| Extension | Description |
|-----------|-------------|
| `v2` with order | Add sequence numbers for front/back/side ordering |
| `v2` with signature | Include uploader signature for authenticity proof |
| `CARDSET-DEL` | Protocol for removing hashes from a set |

These are not part of v1 and may never be. The protocol starts minimal.

---

## CARDSET Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-07 | Initial draft |

---

## License

Public domain. Use freely.