# AgentHire — MVP Contracts Specification

**Version:** 1.0  
**Status:** Canonical implementation specification  
**Last reconciled:** November 18, 2026  
**Project:** AgentHire — Discover. Trust. Hire. Pay. Verify.

> This document defines the canonical data contracts, validation rules, evidence semantics, and security boundaries for the AgentHire MVP.
>
> It is the authoritative repository-level reference for implementation. Examples and fixtures are illustrative unless explicitly labeled as observed evidence. A type definition or proposed test is not proof that the behavior has been implemented or tested.

## 1. Architecture and invariants

AgentHire is an AI agent marketplace combining:

1. **ERC-8004** for on-chain agent identity and registration.
2. **x402 v2** for HTTP-based payment authorization and settlement.
3. **AI orchestration** for discovery, capability evaluation, provider selection, and task coordination.

### 1.1 Canonical MVP task

`wallet-activity-summary@1.0`

The task analyzes public Base Mainnet transactions for a specified wallet and an inclusive range of 1–100 blocks.

The MVP does not provide a complete wallet-history index.

### 1.2 Network separation

| Purpose | Network | Chain ID |
|---|---|---|
| Wallet activity analysis | Base Mainnet | 8453 |
| ERC-8004 identity discovery | Base Mainnet and Base Sepolia | 8453 / 84532 |
| Future x402 payments | Base Sepolia only | 84532 |

Future x402 payment policy:

- Protocol: x402 v2
- Mechanism: `exact`
- Network: `eip155:84532`
- Asset: Base Sepolia test USDC
- Asset address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Decimals: 6

A provider's identity-registration chain does not establish its supported payment network.

### 1.3 Non-negotiable rules

- Default execution mode is `NO_SIGNING`.
- Wallet creation, connection, funding, signing, spending, blockchain writes, and deployments require separate explicit authorization.
- Registry identity does not establish service compatibility.
- Registration metadata is untrusted provider-supplied content.
- Advertised payment support is not verified payment compatibility.
- A successful HTTP 402 challenge does not prove settlement.
- Settlement alone does not prove successful task delivery.
- External providers must not be represented as AgentHire-operated fallback providers, or vice versa.
- Missing or uncertain evidence must not be invented.
- No independent external agent is presumed to support `wallet-activity-summary@1.0`.

---

# B1 — Wallet Activity Summary Request

## 2. Canonical request

```typescript
type Metric =
  | "transactionCounts"
  | "executionStatus"
  | "nativeValueFlows";

type WalletActivitySummaryRequest = {
  taskType: "wallet-activity-summary";
  version: "1.0";
  chainId: 8453;

  walletAddress: string;

  blockRange: {
    fromBlock: number;
    toBlock: number;
  };

  metrics: Metric[];
};
```

### 2.1 Validation

All fields are required. Unknown fields are rejected.

- `taskType` must equal `wallet-activity-summary`.
- `version` must equal `1.0`.
- `chainId` must equal `8453`.
- `walletAddress` must be a valid 20-byte EVM address, validated and checksummed using viem.
- Block numbers must be nonnegative safe integers.
- `fromBlock <= toBlock`.
- The inclusive block range must contain between 1 and 100 blocks.
- `toBlock` cannot exceed the observed chain head.
- `metrics` must be nonempty and contain only supported values.
- Duplicate metrics are rejected.

The inclusive block count is:

```typescript
const expectedBlocks = toBlock - fromBlock + 1;
```

### 2.2 Data collection semantics

Scan all requested blocks using `eth_getBlockByNumber`, including full top-level transaction objects.

Match transactions when:

- `tx.from` equals the requested wallet, or
- `tx.to` equals the requested wallet.

Retrieve receipts for all matching transactions using `eth_getTransactionReceipt`.

Excluded:

- Internal traces.
- ERC-20 and NFT transfer logs.
- Contract-internal value movements.
- Gas expenses.
- Wallet balance changes.
- Unrequested historical transactions.

A 100-block limit is not a complete resource budget. Implement separate RPC concurrency, time, body-size, and execution bounds.

### 2.3 Valid synthetic request

```json
{
  "taskType": "wallet-activity-summary",
  "version": "1.0",
  "chainId": 8453,
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "blockRange": {
    "fromBlock": 38000000,
    "toBlock": 38000049
  },
  "metrics": [
    "transactionCounts",
    "executionStatus",
    "nativeValueFlows"
  ]
}
```

---

# B2 — Wallet Activity Summary Response

## 3. Canonical response

```typescript
type WalletActivitySummaryResponse = {
  taskType: "wallet-activity-summary";
  version: "1.0";
  chainId: 8453;

  walletAddress: string;

  analyzedRange: {
    fromBlock: number;
    toBlock: number;
  };

  summary: {
    outgoingTransactionCount: number;
    incomingDirectTransactionCount: number;
    relatedTransactionCount: number;

    successfulRelatedTransactionCount: number;
    failedRelatedTransactionCount: number;

    nativeValueSentWei: string;
    nativeValueReceivedWei: string;
  };

  sampleTransactionHashes: string[];

  coverage: {
    complete: true;
    processedBlocks: number;
    expectedBlocks: number;

    methods: (
      | "eth_getBlockByNumber"
      | "eth_getTransactionReceipt"
    )[];

    limitations: string[];
    warnings: string[];
  };

  source: {
    rpcOrigin: string;
    fromBlockHash: string;
    toBlockHash: string;
    evidenceIds: string[];
  };

  retrievedAt: string;
};
```

### 3.1 Completeness

A successful response requires:

```typescript
coverage.complete === true
coverage.processedBlocks === coverage.expectedBlocks
coverage.expectedBlocks ===
  analyzedRange.toBlock - analyzedRange.fromBlock + 1
```

Missing blocks, missing receipts, inconsistent source data, or unverifiable boundary hashes must produce errors, not partial success.

The `source` object is mandatory.

### 3.2 Counting rules

- Outgoing: unique top-level transactions where `from == wallet`.
- Incoming direct: unique top-level transactions where `to == wallet`.
- Related: union of outgoing and incoming transactions.
- Self-transfers count once in the related-transaction union.
- Successful and failed counts partition all related transactions.
- Successful native-value transfers contribute to sent/received Wei totals.
- Reverted transactions do not contribute native-value transfers.
- Self-transfers can contribute to both directional Wei sums.
- Wei must be accumulated using arbitrary-precision integers and serialized as canonical decimal strings.

### 3.3 Transaction samples

At most 10 unique transaction hashes.

Ordering:

1. Ascending block number.
2. Ascending transaction index.

No matching transactions means an empty sample array.

### 3.4 Synthetic response fixture

This example is synthetic, not real Base Mainnet evidence.

```json
{
  "status": "success",
  "requestId": "req-fixture-001",
  "data": {
    "taskType": "wallet-activity-summary",
    "version": "1.0",
    "chainId": 8453,
    "walletAddress": "0x0000000000000000000000000000000000000001",
    "analyzedRange": {
      "fromBlock": 38000000,
      "toBlock": 38000049
    },
    "summary": {
      "outgoingTransactionCount": 2,
      "incomingDirectTransactionCount": 2,
      "relatedTransactionCount": 3,
      "successfulRelatedTransactionCount": 2,
      "failedRelatedTransactionCount": 1,
      "nativeValueSentWei": "7",
      "nativeValueReceivedWei": "2"
    },
    "sampleTransactionHashes": [
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    ],
    "coverage": {
      "complete": true,
      "processedBlocks": 50,
      "expectedBlocks": 50,
      "methods": [
        "eth_getBlockByNumber",
        "eth_getTransactionReceipt"
      ],
      "limitations": [
        "Top-level transactions only",
        "Internal and token transfers excluded",
        "Gas fees and net balance changes excluded"
      ],
      "warnings": []
    },
    "source": {
      "rpcOrigin": "https://mainnet.base.org",
      "fromBlockHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "toBlockHash": "0x2222222222222222222222222222222222222222222222222222222222222222",
      "evidenceIds": [
        "ev-fixture-blocks-001"
      ]
    },
    "retrievedAt": "2026-11-18T07:00:00Z"
  }
}
```

---

# B3 — Provider Catalog

## 4. Provider identity

The canonical AgentHire provider key is:

```text
eip155:<registryChainId>/<checksumRegistryAddress>/<decimalAgentId>
```

Example:

```text
eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353
```

This is an internal AgentHire identifier, not a protocol-mandated DID.

The combination of chain ID, registry address, and agent ID identifies the registered agent.

The same numeric agent ID on different chains or registries represents a different provider identity.

Store agent IDs and block numbers as decimal strings.

## 5. Canonical types

```typescript
type Address = string;

type ProviderOrigin =
  | "external"
  | "selfHostedFallback";

type VerificationStatus =
  | "notChecked"
  | "verified"
  | "failed"
  | "inconclusive";

type ProviderService = {
  serviceId: string;
  endpointUrl: string;

  method: "GET" | "POST" | "OTHER";

  description: string | null;
  claimedTaskTypes: string[];

  endpointStatus: VerificationStatus;
  requestSchemaStatus: VerificationStatus;
};

type ObservedPaymentOffer = {
  observedAt: string;
  evidenceId: string;
  serviceId: string;

  x402Version: number;
  scheme: string;
  network: string;

  asset: Address;
  amount: string;
  payTo: Address;

  validationStatus: VerificationStatus;
};

type ProviderRecord = {
  schemaVersion: "1.0";

  providerId: string;
  origin: ProviderOrigin;

  identity: {
    registryChainId: 8453 | 84532;
    registryAddress: Address;
    agentId: string;

    owner: Address | null;
    agentWallet: Address | null;
    tokenURI: string | null;

    observedAtBlock: string;
    observedAt: string;
  };

  registration: {
    uri: string | null;

    fetchStatus:
      | "notFetched"
      | "success"
      | "failed";

    metadataHash: string | null;
    advertisedName: string | null;
    advertisedDescription: string | null;

    operatorEvidenceIds: string[];
  };

  services: ProviderService[];

  payment: {
    x402Advertised: boolean | null;
    advertisedNetworks: string[];

    observedOffers: ObservedPaymentOffer[];
  };

  compatibility: {
    taskType: "wallet-activity-summary";
    taskVersion: "1.0";

    requestSchemaStatus: VerificationStatus;
    responseSchemaStatus: VerificationStatus;
    paymentStatus: VerificationStatus;
  };

  operational: {
    lastCheckedAt: string | null;
    lastErrorCode: string | null;
    evidenceIds: string[];
  };
};
```

## 6. Provider knowledge classes

AgentHire must distinguish three classes of knowledge.

### 6.1 On-chain identity

Observed through ERC-8004:

- Registry chain.
- Registry address.
- Agent ID.
- Owner.
- Agent wallet.
- Registration URI.
- Block number/hash and observation time.

On-chain identity proves only the specified registry observations.

It does not prove that the metadata endpoint is reachable, that the web API is operated by the owner, or that the provider supports any particular task or payment method.

### 6.2 Self-reported metadata

Examples:

- Advertised name.
- Description.
- Services.
- Endpoint URLs.
- Claimed capabilities.
- Claimed payment networks.
- Claimed x402 support.

These remain claims until independently verified.

### 6.3 Independent observations

Examples:

- Actual endpoint reachability.
- Request/response schema compatibility.
- A live x402 HTTP 402 challenge.
- Payment-policy compatibility.
- Settlement evidence.
- Delivered task response.

A 402 response from an unrelated service does not prove compatibility with `wallet-activity-summary@1.0`.

## 7. Provider normalization rules

### 7.1 Identity

- Validate registry chain and address.
- Validate EVM addresses using viem.
- Normalize checksummed addresses.
- Use exact decimal agent IDs.
- Preserve snapshot provenance.
- Zero-address agent wallets normalize to `null`.
- Do not substitute owner for agent wallet.
- Do not infer payment recipient from owner or agent wallet.

### 7.2 Registration

Registration metadata must be joined by the full provider identity.

Validate URI association and preserve the source metadata digest.

Do not join by provider name alone.

The registration may change after the observed registry block. Its HTTP retrieval timestamp and body digest are separate evidence.

`operatorEvidenceIds` must remain empty unless operator identity has independent supporting evidence.

### 7.3 Services

A canonical service requires a valid endpoint URL.

Incomplete claims may be preserved in diagnostics, but must not be converted into fabricated callable endpoints.

- Explicit methods `GET` and `POST` may be preserved.
- Otherwise use `OTHER`.
- Task claims require explicit evidence.
- Keyword similarity is not sufficient.
- Newly normalized services have `endpointStatus: "notChecked"`.
- Request compatibility starts at `notChecked`.

### 7.4 Payment

- `x402Advertised` reflects explicit metadata claims.
- Missing claim means `null`.
- Explicit false remains `false`.
- `advertisedNetworks` contains only explicit, well-formed claims.
- `observedOffers` remains empty until a genuine HTTP 402 offer is observed.
- Identity chain does not imply payment network.
- Payment compatibility remains `notChecked` until independent checks.

### 7.5 Origin

`external` describes the cataloged provider's intended origin category; it does not independently authenticate the operator.

`selfHostedFallback` must be assigned only to an explicitly AgentHire-operated service.

Never silently substitute the fallback for a failed external service.

---

# B4 — Verification State and Evidence

## 8. Verification checkpoints

```typescript
type CheckResult =
  | "notChecked"
  | "passed"
  | "failed"
  | "inconclusive"
  | "stale";

type VerificationCheck =
  | "registryIdentity"
  | "registrationMetadata"
  | "endpointReachability"
  | "taskRequestCompatibility"
  | "taskResponseCompatibility"
  | "x402Challenge"
  | "paymentPolicy"
  | "paidExecution";

type CheckSnapshot = {
  result: CheckResult;
  checkedAt: string | null;
  evidenceIds: string[];
  reasonCode?: string;
};

type ProviderVerification = {
  providerId: string;
  serviceId: string;

  taskType: "wallet-activity-summary";
  taskVersion: "1.0";

  checks: Record<VerificationCheck, CheckSnapshot>;

  derivedMilestone:
    | "unverified"
    | "discovered"
    | "metadataValidated"
    | "endpointReachable"
    | "challengeVerified"
    | "paymentCompatible"
    | "paidVerified";

  availability:
    | "unknown"
    | "available"
    | "blocked";

  evaluatedAt: string;
};
```

## 9. Milestone derivation

Milestones are derived from evidence; they must never be manually assigned without satisfying their prerequisites.

| Milestone | Required evidence |
|---|---|
| `unverified` | Insufficient identity evidence |
| `discovered` | Valid ERC-8004 registry read |
| `metadataValidated` | Registration metadata retrieved and validated |
| `endpointReachable` | Relevant endpoint independently responds |
| `challengeVerified` | Relevant live x402 v2 HTTP 402 challenge is valid |
| `paymentCompatible` | Relevant x402 offer satisfies approved payment policy |
| `paidVerified` | Authorized payment, independently supported settlement, and valid delivered response |

`paymentCompatible` requires an offer tied to the correct provider, service and task, using x402 v2, `exact`, Base Sepolia, approved test USDC, and approved amount and recipient.

Task schema compatibility must also be evaluated independently.

`paidVerified` requires more than a successful payment.

### 9.1 Availability

Availability is distinct from verification milestone.

Possible values:

- `unknown`
- `available`
- `blocked`

An endpoint outage may make a previously verified provider unavailable without erasing historical evidence.

### 9.2 Day 3 upper bound

Through D3.6, the highest supported milestone is:

`metadataValidated`

No endpoint reachability, live challenge compatibility, or paid execution is established by registry and registration metadata alone.

---

## 10. Append-only verification evidence

```typescript
type EvidenceKind =
  | "registryRead"
  | "metadataFetch"
  | "endpointProbe"
  | "x402Challenge"
  | "taskSchemaCheck"
  | "paymentPolicyCheck"
  | "paymentSettlement"
  | "providerResponse";

type VerificationEvidence = {
  evidenceId: string;
  schemaVersion: "1.0";

  providerId: string;
  serviceId: string | null;

  kind: EvidenceKind;

  outcome: "passed" | "failed" | "inconclusive";

  reasonCode: string | null;

  observedAt: string;
  expiresAt: string | null;

  source: {
    kind: "rpc" | "https" | "localValidation";
    endpoint: string | null;
    method: string | null;
  };

  chain: {
    chainId: number | null;
    registryAddress: Address | null;
    blockNumber: string | null;
    blockHash: string | null;
    transactionHash: string | null;
  };

  http: null | {
    status: number | null;
    requestMethod: string | null;
    requestUrl: string | null;
    responseHeaders: Record<string, string>;
    responseBodySha256: string | null;
  };

  payment: null | {
    x402Version: number;
    scheme: string;
    network: string;
    asset: Address;
    amount: string;
    payTo: Address;
    settlementTransactionHash: string | null;
  };

  requestDigest: string | null;
  responseDigest: string | null;

  summary: string;
};
```

### 10.1 Evidence integrity

Evidence must:

- Be append-only.
- Have stable identifiers.
- Preserve original observation context.
- Include relevant chain and block identifiers.
- Include HTTP response hashes where applicable.
- Distinguish actual observations from local validation.
- Use sanitized endpoint strings and headers.
- Never expose authorization secrets or payment signatures.

A SHA-256 document digest establishes integrity relative to recorded bytes, not the identity or trustworthiness of the remote server's operator.

### 10.2 Recheck policy

Proposed policy:

| Evidence | Recheck expectation |
|---|---|
| Registry identity | Before intended paid selection |
| Registration metadata | Within 24 hours or after URI change |
| Endpoint reachability | Within 15 minutes |
| x402 challenge | Fresh per prospective payment |
| Payment policy | Fresh per prospective payment |
| Settlement | Verify independently and retain historically |

Historical payment success must not be used as proof of current eligibility.

---

# B5 — Application Envelopes and Errors

## 11. Success and error contracts

```typescript
type ApiSuccess<T> = {
  status: "success";
  requestId: string;
  data: T;
};

type ApiError = {
  status: "error";
  requestId: string;

  error: {
    code: AgentHireErrorCode;
    message: string;
    retryable: boolean;

    details?: {
      fieldIssues?: {
        path: string;
        code: string;
      }[];

      [key: string]: unknown;
    };

    evidenceIds?: string[];
  };
};
```

`AgentHireErrorCode` is the union of the codes in the application and payment-security sections of this document.

## 12. Validation precedence

For request structural errors:

1. Validate field structure and types.
2. Return `INVALID_REQUEST_SCHEMA` with up to 10 sanitized field issues.
3. Sort field issues by stable field-path order.
4. Do not echo user-provided values.

Once structurally valid, apply:

1. `UNSUPPORTED_CHAIN`
2. `BLOCK_RANGE_TOO_LARGE`
3. `BLOCK_NOT_AVAILABLE`
4. RPC and execution checks.

Do not select inconsistent primary errors merely because several fields are malformed.

## 13. Error mapping

| Error code | HTTP status | Retry |
|---|---|---|
| `INVALID_REQUEST_SCHEMA` | 400 | No |
| `INVALID_WALLET_ADDRESS` | 400 | No |
| `INVALID_BLOCK_RANGE` | 400 | No |
| `UNSUPPORTED_METRIC` | 400 | No |
| `UNSUPPORTED_CHAIN` | 400 | No |
| `BLOCK_RANGE_TOO_LARGE` | 400 | No |
| `BLOCK_NOT_AVAILABLE` | 422 | Only when chain head advances |
| `RPC_UNAVAILABLE` | 503 | Bounded |
| `RPC_INCOMPLETE` | 503 | Bounded |
| `CHAIN_DATA_INCONSISTENT` | 502 | Fresh read |
| `PROVIDER_NOT_FOUND` | 404 | No |
| `PROVIDER_ENDPOINT_UNREACHABLE` | 502 | Bounded/provider change |
| `PROVIDER_SCHEMA_MISMATCH` | 502 | Requires correction |
| `PROVIDER_UNAVAILABLE` | 503 | Bounded |
| `PAYMENT_NETWORK_MISMATCH` | 422 | Requires new selection |
| `PAYMENT_ASSET_MISMATCH` | 422 | Requires new selection |
| `PAYMENT_POLICY_REJECTED` | 422 | Requires new approval/policy |
| `PAYMENT_SETTLEMENT_UNVERIFIED` | 502 | Manual reconciliation |
| `INTERNAL_ERROR` | 500 | Cause-dependent |

Never blindly retry a payment with uncertain settlement.

Native x402 HTTP 402 responses must retain their protocol-specific transport format rather than being converted into generic application errors.

### 13.1 Fail-closed RPC example

```json
{
  "status": "error",
  "requestId": "req-fixture-002",
  "error": {
    "code": "RPC_INCOMPLETE",
    "message": "The requested block range could not be fully analyzed.",
    "retryable": true,
    "details": {
      "expectedBlocks": 50,
      "processedBlocks": 37,
      "complete": false
    },
    "evidenceIds": [
      "ev-fixture-rpc-failure-001"
    ]
  }
}
```

---

# B6 — Acceptance Fixtures and Implementation Gates

## 14. Synthetic acceptance test inventory

These are proposed acceptance scenarios, not proof of executed tests.

| Fixture | Description | Expected result |
|---|---|---|
| REQ-001 | Valid 50-block range | Accept |
| REQ-002 | Exactly 100 blocks | Accept |
| REQ-003 | One block | Accept |
| REQ-004 | 101 blocks | Reject |
| REQ-005 | Reversed range | Reject |
| REQ-006 | Negative, fractional or unsafe block | Reject |
| REQ-007 | Wrong chain | Reject |
| REQ-008 | Malformed wallet address | Reject |
| REQ-009 | Invalid mixed-case checksum | Reject |
| REQ-010 | Unknown, duplicate or empty metrics | Reject |
| REQ-011 | Unknown request property | Reject |
| REQ-012 | Future block | Reject |
| RES-001 | Three-transaction example | Correct counts and Wei |
| RES-002 | No matching transactions | Valid empty result |
| RES-003 | Self-transfer | Correct union/directional counting |
| RES-004 | Failed transaction with nonzero value | Exclude reverted value |
| RES-005 | Very large Wei amount | Exact bigint serialization |
| RES-006 | More than 10 matching transactions | Deterministic first 10 |
| RES-007 | Missing receipt | Fail closed |
| RES-008 | Missing block | Fail closed |
| RES-009 | Inconsistent chain data | Fail closed |
| RES-010 | False `complete:true` | Schema mismatch |
| PROV-001 | Mainnet 402, Sepolia-only policy | Payment policy mismatch |
| PROV-002 | Provider returns `503 x402_not_configured` | Unavailable, not challenge verified |
| PROV-003 | Provider connection timeout | Inconclusive |
| PROV-004 | AgentHire fallback | Correct origin, initially unverified |
| PROV-005 | Wrong payment asset | Reject |
| PROV-006 | Metadata-only task claim | Remains unverified |
| PROV-007 | Prior paid success followed by outage | Preserve history; current blocked |
| PROV-008 | Settlement succeeded, delivered response invalid | Not paidVerified |

## 15. Release gates

Before any public payment execution:

- Confirm exact SDK and transitive dependency versions.
- Re-run security audits on the committed lockfile.
- Verify payload size and execution limits.
- Verify provider endpoint policy.
- Verify request and response schemas.
- Verify x402 version, mechanism, network, asset, amount, payTo and expiration.
- Require explicit authorization for the payment.
- Confirm idempotency and no blind repayment.
- Verify independent settlement evidence.
- Validate the delivered task result.
- Confirm all credentials and signatures are handled securely.

### 15.1 Previously observed dependency concerns

Historical research identified:

- `zod@3.25.76` — `GHSA-mrhx-c7xc-m3w5`.
- `picomatch@4.0.7` — `GHSA-fc5q-39xc-vjpf`.

Those findings applied to an earlier research dependency graph. The actual installed graph must be audited independently.

A clean audit of the minimal Day 3 repository does not establish that future x402 or frontend dependencies are safe.

Do not force incompatible dependency upgrades or suppress advisories without investigation.

### 15.2 ERC-8004 ABI provenance

Official contracts repository:

https://github.com/erc-8004/erc-8004-contracts

Pinned commit:

`b9e466c250744a7e06b13dff9d3c2844ed64f825`

Canonical ABI artifact:

`abis/IdentityRegistry.json`

The actual repository contains the pinned artifact and its documented digest.

### 15.3 Provider research context

These observations are historical research context, not automatically imported verification evidence.

**Agent402**

- ERC-8004 Base Mainnet identity.
- Previously observed x402 v2 HTTP 402 on Mainnet.
- No established Sepolia payment compatibility.
- No verified wallet-summary task compatibility.

**QuantJourney**

- ERC-8004 Base Sepolia identity.
- Earlier endpoint observation included `503 x402_not_configured`.
- No verified paid task execution.

**Selfradiance**

- A previously investigated Worker endpoint timed out.
- Registry identity and x402 compatibility remain unverified.
- Additional probing was intentionally stopped.

**AgentHire fallback**

- Planned as a clearly labeled AgentHire-operated provider.
- No registration, deployment or paid execution is assumed.
- Its future implementation requires separate approval.

---

# Payment-Security Addendum

## 16. Additional payment error codes

The payment-security specification extends the application error model:

```typescript
type PaymentSecurityErrorCode =
  | "ENDPOINT_POLICY_REJECTED"
  | "INVALID_X402_CHALLENGE"
  | "UNSUPPORTED_X402_VERSION"
  | "PAYMENT_NETWORK_MISMATCH"
  | "PAYMENT_ASSET_MISMATCH"
  | "PAYMENT_RECIPIENT_REJECTED"
  | "PAYMENT_POLICY_REJECTED"
  | "QUOTE_INTEGRITY_MISMATCH"
  | "QUOTE_EXPIRED"
  | "AUTHORIZATION_REQUIRED"
  | "DELEGATION_NOT_ACTIVE"
  | "BUDGET_EXCEEDED"
  | "DUPLICATE_PAYMENT_ATTEMPT"
  | "SIGNING_DISABLED"
  | "PAYMENT_SETTLEMENT_UNVERIFIED"
  | "PAID_DELIVERY_FAILED";
```

General status conventions:

- `422`: Provider offer or payment-policy mismatch.
- `409`: Changed/expired quote or conflicting idempotency key.
- `403`: Missing authority or signing disabled.
- `502`: Uncertain settlement or paid-delivery failure.

A retryable response never grants new financial authority.

## 17. Manual and delegated authorization

Manual payment approval uses:

`authorizationMode: "explicitPerPayment"`

Autonomous delegated authorization must instead use a separately approved, versioned `DelegatedPaymentPolicy`, with an individual `AuthorizationDecision` for each proposed quote.

The agent must not manufacture human approvals to justify autonomous spending.

The protected signer remains disabled until a separately approved setup enables it.

## 18. Financial safety invariants

- Never sign without an applicable authorization.
- Never exceed payment or delegated budget limits.
- Never change network, asset, recipient or amount after authorization.
- Never blindly retry an uncertain settlement.
- Preserve idempotency across retries.
- Reconcile settlement before another payment attempt.
- Revocation must prevent new delegated authorizations.
- Store no private keys, signed payment payloads or payment credentials in evidence logs.
- A payment does not establish valid task delivery.
- Keep payment settlement and response verification as distinct evidence checks.

---

# Implementation Guidance

## 19. Day 3 completion boundary

D3.1–D3.5 established the reported foundation for:

- TypeScript repository and tests.
- Pinned ERC-8004 ABI.
- Read-only Base RPC access.
- On-chain registry reads.
- Safe retrieval and parsing of approved registration metadata.

D3.6 implements:

- Canonical `ProviderRecord@1.0`.
- Stable provider keys.
- Normalization from existing identity and metadata evidence.
- Conservative service and payment claims.
- Append-only verification evidence.
- Deterministic offline tests and catalog generation.

For D3.6, all provider task-schema and payment compatibility fields must remain `notChecked` unless independent evidence explicitly supporting a check already exists and is in scope.

**No new RPC, metadata fetch, provider probe, payment or signing operations belong to D3.6.**

D3.7 consolidates the read-only spike, actual test evidence and unresolved blockers.

## 20. Source precedence and change management

For implementation decisions, use:

1. This repository-level canonical specification, version 1.0.
2. Security restrictions and explicitly approved project policies.
3. Verified ERC-8004 and x402 upstream specifications.
4. Actual versioned repository source, observed evidence and tests.
5. Historical research notes and coding-agent reports.

If a genuine conflict arises, document it rather than silently modifying the canonical contract.

Changes to public contracts must be versioned and reviewed.

The original planning reference was maintained in the AgentHire Notion workspace. The repository copy exists to make those requirements directly accessible to coding agents.

## 21. Definition of trustworthy implementation evidence

A feature is not considered verified simply because a report says it is complete.

Evidence should include:

- Relevant Git commit.
- Actual source files.
- Exact dependency versions.
- Reproducible commands.
- Actual test results.
- Recorded RPC or HTTP observations when applicable.
- Sanitized failures.
- Known limitations.

Do not confuse a mock result with a live observation.

**End of AgentHire MVP Contracts Specification v1.0.**