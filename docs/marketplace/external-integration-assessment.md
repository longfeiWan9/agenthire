# External Integration Assessment (D4.5)

**Mode:** `STRICTLY_OFFLINE`  
**Policy:** ≤5 candidates · all `approvedForNetworkExecution: false` · `paymentCompatible: false`

## Scope

Integration readiness is assessed **across all curated categories**, not wallet-summary-only. Search ranking is a separate lens.

## Selection preferences

1. Prefer clear, narrow, read-only skills/services with descriptions.
2. Exclude destructive verbs (delete/wipe/execute-paid/transfer/…).
3. Exclude credential / secret / private-key hints.
4. Down-rank ambiguous method-unspecified URL-only resources.
5. Skip synthetic fixture rows in production shortlists.
6. Empty shortlist is valid; empty categories are allowed.

## Sepolia x402 payment policy (unchanged)

Discoverable ≠ payable. Candidates never flip `paymentCompatible` from metadata alone.

## Current offline shortlist

See `docs/marketplace/evidence/external-integration-candidates.json` (built by `pnpm build:marketplace`).

All five candidates are agent-card skills with descriptions; none are approved for network execution.

## Next authorization (not executed)

Any live follow-up requires a new exact URL allowlist, renewed human authorization, and separate security gates. D4.4b CATALOG-001 marker remains single-use; see `docs/security/d4.4b-authorization-incident.md`.
