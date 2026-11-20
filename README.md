# CARDIMG Protocol

Onchain card image registry for BSV.

## CARDIMG Transaction Structure

```
OP_FALSE OP_RETURN "CARDIMG" <image_data>
```

- `OP_FALSE` — Makes the output unspendable
- `OP_RETURN` — Allows data in the output
- `"CARDIMG"` — Protocol identifier (7 bytes ASCII)
- `<image_data>` — Raw image bytes (any format, any size)

Anyone can upload. Anyone can index. The protocol stores image data only — no metadata, no identity, no version byte. All meaning (card ID, condition, ownership, etc.) is application-layer.

## CARDSET Transaction Structure

CARDSET transactions link CARDIMG txids together as different images (front, back) of the same card:

```
OP_FALSE OP_RETURN "CARDSET" <cardimg_txid_1> <cardimg_txid_2> ...
```

- `OP_FALSE` — Makes the output unspendable
- `OP_RETURN` — Allows data in the output
- `"CARDSET"` — Protocol identifier (7 bytes ASCII)
- `<cardimg_txid_n>` — Transaction ID of a CARDIMG tx (32 bytes each)

The first txid (cardimg_txid_1) is the front image of the card, the second (cardimg_txid_2) is the back image of the same card, and any additional txids are supplementary angles of the card. This is convention only — not enforced by protocol.

## Ecosystem

| Module | Purpose |
|--------|---------|
| [cardimg-portal](https://github.com/axiemaid/cardimg-portal) | Explorer + Uploader — browse and upload card images on-chain |

The chain is the glue.

## License

Public domain. Use freely.
