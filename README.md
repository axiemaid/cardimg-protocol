# CARDIMG Protocol

Onchain card image registry for BSV.

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

- `OP_FALSE` — Makes the output unspendable
- `OP_RETURN` — Allows data in the output
- `"CARDIMG"` — Protocol identifier (7 bytes ASCII)
- `<image_data>` — Raw image bytes (any format, any size)

Anyone can upload. Anyone can index. The protocol stores image data only — no metadata, no identity, no version byte. All meaning (card ID, condition, ownership, etc.) is application-layer.

## CARDSET (Companion Protocol)

Links CARDIMG txids together as a set:

```
OP_FALSE OP_RETURN "CARDSET" <cardimg_txid_1> <cardimg_txid_2> ...
```

- `"CARDSET"` — Protocol identifier (7 bytes ASCII)
- `<cardimg_txid_n>` — Transaction ID of a CARDIMG tx (32 bytes each)

Txid-based references — resolvable without a pre-built index. Positional ordering by convention: pos 0 = front, pos 1 = back, pos 2+ = supplementary. Not enforced by protocol.

## Cost

0.1 sats/byte, calculated from actual serialized transaction size.

## Ecosystem

| Module | Purpose |
|--------|---------|
| [cardimg-upload](https://github.com/axiemaid/cardimg-upload) | Upload card scans on-chain |
| [cardimg-bind](https://github.com/axiemaid/cardimg-bind) | Create CARDSET transactions |
| [cardimg-indexer](https://github.com/axiemaid/cardimg-indexer) | Index all CARDIMG/CARDSET txs |
| [cardimg-api](https://github.com/axiemaid/cardimg-api) | HTTP API for indexed data |
| [cardimg-scan](https://github.com/axiemaid/cardimg-scan) | Scan validation (DPI, edges, background) |
| [cardimg-viewer](https://github.com/axiemaid/cardimg-viewer) | Web gallery for browsing cards |

Each is independent. The chain is the glue.

## License

Public domain. Use freely.
