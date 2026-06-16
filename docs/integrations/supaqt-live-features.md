# SupaQt Live Feature Requirements

This document tracks backend/API requirements for Sidecoin product features that
depend on SupaQt indexing, transaction construction, broadcast, swap routing, or
message support.

Sidecoin may ship preview UI and marketing surfaces before these APIs exist, but
production live flows must wait until the required backend capabilities are
available and covered by smoke/parity tests.

## Current integration status

Sidecoin currently uses live API data for Explorer surfaces.

| Feature | Source | Sidecoin surface | Status |
| --- | --- | --- | --- |
| L1 blocks | Official Signet explorer via Sidecoin API adapter | Explorer | Live |
| L1 transactions | Official Signet explorer via Sidecoin API adapter | Explorer | Live |
| BitNames blocks | SupaQt via Sidecoin API adapter | Explorer | Live |
| BitNames transactions | SupaQt via Sidecoin API adapter | Explorer | Live |
| Thunder blocks | SupaQt via Sidecoin API adapter | Explorer | Live |
| Thunder transactions | SupaQt via Sidecoin API adapter | Explorer | Live |

Current Explorer parity is checked with:

```bash
node scripts/compare-explorer.mjs
```

Current public portal analytics coverage is checked with:

```bash
node scripts/check-simpleanalytics.mjs
```

## Features waiting on SupaQt backend support

| Product area | Preview UI allowed now | Live backend required |
| --- | --- | --- |
| Asset swaps | Yes | Yes |
| BitMessages / on-chain messaging | Yes | Yes |
| Swap settlement tracking | Partial | Yes |
| Message indexing/search | Partial | Yes |

## Asset swaps

### Goal

Allow users to quote, prepare, sign, broadcast, and track swaps between supported
Sidecoin chains and assets.

Example flows:

| Flow | Example |
| --- | --- |
| Parent to sidechain | L1 to BitNames |
| Sidechain to parent | BitNames to L1 |
| Sidechain to sidechain | Thunder to BitAssets |
| Asset to asset | CoinShift-style swap |

### Required SupaQt capabilities

SupaQt needs to provide stable APIs for the full swap lifecycle.

| Capability | Required purpose |
| --- | --- |
| Chain and asset discovery | List supported chains, assets, limits, and route availability |
| Quote endpoint | Return price, fees, route, expiration, and warnings before signing |
| Transaction build endpoint | Convert an accepted quote into wallet-signable payloads |
| Broadcast endpoint | Submit signed swap transactions |
| Swap status endpoint | Track submitted, pending, completed, failed, refunded, and expired swaps |
| Stable error model | Return machine-readable errors that Sidecoin can safely display |

### Minimum swap discovery fields

| Field | Description |
| --- | --- |
| chainId | Sidecoin chain id, such as l1, bitnames, thunder |
| assetId | Asset identifier on that chain |
| ticker | Display ticker |
| displayName | Human-readable asset name |
| decimals | Decimal precision |
| minAmount | Minimum swap amount |
| maxAmount | Maximum swap amount, if known |
| enabled | Whether this asset is currently swappable |
| warnings | Chain or asset specific warnings |

### Minimum quote fields

| Field | Description |
| --- | --- |
| quoteId | Stable quote identifier |
| expiresAt | Quote expiration timestamp |
| fromChainId | Source chain |
| fromAssetId | Source asset |
| toChainId | Destination chain |
| toAssetId | Destination asset |
| fromAmount | Source amount |
| toAmountEstimated | Estimated destination amount |
| minToAmount | Slippage-protected minimum output |
| networkFee | Estimated network fee |
| serviceFee | Estimated service fee, if any |
| totalFee | Total fee estimate |
| route | Route steps |
| warnings | User-facing warnings |

### Minimum swap build fields

| Field | Description |
| --- | --- |
| swapId | Stable swap identifier |
| quoteId | Quote identifier |
| unsignedTransactions | One or more unsigned transactions |
| signingPayloads | Wallet-signable payloads |
| requiredSignatures | Signing requirements |
| expiresAt | Build expiration |
| warnings | User-facing warnings |

### Minimum swap broadcast fields

| Field | Description |
| --- | --- |
| swapId | Swap identifier |
| signedTransactions | Signed transactions or signed payloads |
| status | submitted, pending, confirmed, failed, expired |
| txids | Broadcast transaction ids |
| submittedAt | Submission timestamp |
| nextPollAfter | Suggested polling delay |
| warnings | User-facing warnings |

### Minimum swap status fields

| Field | Description |
| --- | --- |
| swapId | Swap identifier |
| status | quoted, built, submitted, pending, completed, failed, refunded, expired |
| fromChainId | Source chain |
| toChainId | Destination chain |
| fromAmount | Source amount |
| toAmountActual | Actual received amount, if complete |
| txids | Related transaction ids |
| confirmations | Confirmation state |
| failureReason | Failure reason, if failed |
| refundTxid | Refund transaction id, if refunded |
| updatedAt | Last update timestamp |

### Swap UI states

Sidecoin wallet/web UI should support these states before marking swaps live.

| State | Description |
| --- | --- |
| Preview | Marketing and education only |
| Unavailable | Backend route is not available |
| Quote loading | Fetching quote |
| Quote ready | Quote available for review |
| Quote expired | User must refresh |
| Build ready | Transaction ready for signing |
| Signing | Wallet is signing |
| Broadcasting | Signed transaction is being submitted |
| Pending | Swap submitted and waiting |
| Completed | Swap completed |
| Failed | Swap failed |
| Refunded | Funds refunded |

### Swap safety requirements

Before enabling live swaps, Sidecoin must show these warnings where applicable.

| Warning | Reason |
| --- | --- |
| Quotes can expire | Prevent stale execution |
| Fees may change | Network fees can move |
| Settlement may take time | Cross-chain operations are not instant |
| Routes may fail | Liquidity or chain conditions can change |
| Refunds may require waiting | Refund paths may be time-bound |
| Addresses must be verified | Wrong recipient addresses may be irreversible |

## BitMessages / on-chain messaging

### Goal

Allow users to compose, send, discover, and view public on-chain messages or
BitNames-linked messages.

Messages may use OP_RETURN-style payloads, sidechain-native message
transactions, BitNames records, or another SupaQt-supported format.

### Required SupaQt capabilities

SupaQt needs to provide stable APIs for the full message lifecycle.

| Capability | Required purpose |
| --- | --- |
| Message capability discovery | Identify supported chains, formats, limits, and fee policy |
| Message encode/preview endpoint | Validate size, encode payload, estimate fees, and show warnings |
| Message transaction build endpoint | Build unsigned message transactions |
| Message broadcast endpoint | Submit signed message transactions |
| Message lookup endpoints | Fetch messages by id, address, BitName, thread, or recent feed |
| Stable error model | Return machine-readable errors that Sidecoin can safely display |

### Minimum message capability fields

| Field | Description |
| --- | --- |
| chainId | Supported chain |
| mode | op_return, bitnames_record, sidechain_message, or other |
| maxBytes | Maximum message payload size |
| feePolicy | Fee calculation mode |
| supportsThreads | Whether replies/threading are supported |
| supportsContacts | Whether contact metadata is supported |
| enabled | Whether messaging is available |

### Minimum message preview fields

| Field | Description |
| --- | --- |
| messageIdPreview | Deterministic preview id, if possible |
| encodedPayload | Encoded message payload |
| byteLength | Encoded byte length |
| feeEstimate | Estimated fee |
| warnings | User-facing warnings |
| valid | Whether the message can be sent |

### Minimum message build fields

| Field | Description |
| --- | --- |
| draftId | Message draft identifier |
| unsignedTransaction | Unsigned transaction |
| signingPayloads | Wallet-signable payloads |
| fee | Required fee |
| warnings | User-facing warnings |

### Minimum message broadcast fields

| Field | Description |
| --- | --- |
| messageId | Message identifier |
| txid | Broadcast transaction id |
| status | submitted, pending, confirmed, failed |
| submittedAt | Submission timestamp |

### Useful message lookup endpoints

```text
GET /v1/chains/:chainId/messages/:messageId
GET /v1/chains/:chainId/messages?address=:address
GET /v1/chains/:chainId/messages?name=:bitname
GET /v1/chains/:chainId/messages?thread=:threadId
GET /v1/chains/:chainId/messages/recent
```

### Minimum indexed message fields

| Field | Description |
| --- | --- |
| messageId | Stable message identifier |
| chainId | Chain id |
| txid | Transaction id |
| senderAddress | Sender address |
| senderName | Optional BitName |
| recipientAddress | Optional recipient address |
| recipientName | Optional BitName |
| subject | Optional subject |
| body | Decoded body |
| bodyPreview | Short preview |
| byteLength | Encoded payload length |
| timestamp | Confirmation timestamp |
| status | pending or confirmed |
| replyTo | Parent message id |
| threadId | Thread identifier |
| metadata | Optional structured metadata |

### BitMessages safety requirements

Before enabling live messaging, Sidecoin must show these warnings where
applicable.

| Warning | Reason |
| --- | --- |
| Messages are public | On-chain data is visible |
| Messages may be permanent | Confirmed data may not be removable |
| Do not include secrets | Private keys/passwords must never be sent |
| Fees apply | Message transactions cost fees |
| Metadata may identify users | Addresses, names, and timing can leak context |
| Spam filtering may apply | Public message feeds need abuse controls |

## Sidecoin API adapter expectations

Sidecoin should not connect wallet UI directly to unstable upstream endpoints.

Preferred flow:

```text
SupaQt API -> Sidecoin API adapter -> Sidecoin Wallet/Web/Explorer
```

Benefits:

| Benefit | Description |
| --- | --- |
| Stable UI contract | Frontends consume Sidecoin-shaped data |
| Safer migrations | SupaQt response changes can be normalized |
| Centralized validation | Sidecoin API can validate and sanitize fields |
| Better tests | Smoke tests can compare upstream and adapter output |
| Better fallbacks | Preview and unavailable states can be handled consistently |

## Required smoke tests before production launch

Before enabling live swaps, add:

```text
scripts/compare-swaps.mjs
```

Before enabling live BitMessages, add:

```text
scripts/compare-bitmessages.mjs
```

These scripts should verify required response shapes, expected error behavior,
status polling, and Sidecoin API adapter parity.

## Launch gating checklist

### Swaps

| Requirement | Status |
| --- | --- |
| SupaQt route/asset discovery | Waiting |
| SupaQt quote endpoint | Waiting |
| SupaQt build endpoint | Waiting |
| SupaQt broadcast endpoint | Waiting |
| SupaQt status endpoint | Waiting |
| Sidecoin API adapter | Waiting |
| Wallet signing integration | Waiting |
| Explorer transaction visibility | Partial |
| Smoke/parity tests | Waiting |
| User safety warnings | Waiting |

### BitMessages

| Requirement | Status |
| --- | --- |
| SupaQt capability discovery | Waiting |
| SupaQt encode/preview endpoint | Waiting |
| SupaQt build endpoint | Waiting |
| SupaQt broadcast endpoint | Waiting |
| SupaQt message lookup endpoints | Waiting |
| Sidecoin API adapter | Waiting |
| Wallet composer UI | Waiting |
| Explorer message visibility | Waiting |
| Smoke/parity tests | Waiting |
| User safety warnings | Waiting |

## Preview UI policy

Sidecoin may ship marketing/preview UI before backend support if the UI is
clearly labeled.

Allowed labels:

```text
Preview
Coming soon
Backend integration pending
Requires SupaQt live support
```

Disallowed labels before backend launch:

```text
Live
Available now
Trade now
Send now
Broadcast
Execute swap
Message sent
```

Preview UI must not collect signatures, broadcast transactions, or imply that
funds/messages will move on-chain until the live backend is ready.

## Summary

SupaQt support is the production blocker for live swaps and BitMessages.

Until then, Sidecoin can safely ship:

| Surface | Allowed now |
| --- | --- |
| Marketing preview | Yes |
| Wallet preview panels | Yes, if clearly disabled |
| Educational modals | Yes |
| Explorer links/status pages | Yes |
| Real swap execution | No |
| Real message broadcast | No |
