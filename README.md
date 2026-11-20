# CARDIMG Protocol

Minimal onchain card image registry for BSV.

## Protocol

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

No version byte. No metadata. No chunking. Just image bytes.

- **Permissionless:** Anyone can upload or index
- **All meaning is application-layer:** Card ID, identity, condition, price, ownership — none in the protocol

## CARDSET (Companion Protocol)

Links CARDIMG txids together as a set (front, back, angles):

```
OP_FALSE OP_RETURN "CARDSET" <cardimg_txid_1> <cardimg_txid_2> ...
```

Txid-based references — universally resolvable from cold start. Positional ordering by convention (pos 0 = front, pos 1 = back, pos 2+ = supplementary). Not enforced.

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
