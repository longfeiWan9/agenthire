/**
 * L3 evidence requirements for a future authorized Agent402 PoW live run (D7.3).
 * Offline simulation never satisfies these.
 */

import {
  POW_CHALLENGE_GET_MARKER_REL,
  POW_CHALLENGE_URL,
  POW_EXPECTED_ENVELOPE,
  POW_SUBMIT_POST_MARKER_REL,
  POW_SUBMIT_URL,
  type PowLadderLevel,
} from "./types.ts";

export type PowL3EvidenceRequirement = {
  readonly id: string;
  readonly required: true;
  readonly description: string;
};

/**
 * Checklist that must all be true before claiming ladder L3 via PoW.
 * Simulation / fake transport can never tick these as live.
 */
export const POW_L3_EVIDENCE_REQUIREMENTS: readonly PowL3EvidenceRequirement[] =
  [
    {
      id: "separate-live-auth",
      required: true,
      description:
        "Fresh human authorization distinct from JSONVALIDATE-001/002 observe-only auth",
    },
    {
      id: "get-marker",
      required: true,
      description: `Exclusive wx marker before GET at ${POW_CHALLENGE_GET_MARKER_REL}`,
    },
    {
      id: "post-marker",
      required: true,
      description: `Exclusive wx marker before POST at ${POW_SUBMIT_POST_MARKER_REL}`,
    },
    {
      id: "exact-challenge-url",
      required: true,
      description: `Challenge GET exact URL ${POW_CHALLENGE_URL}`,
    },
    {
      id: "exact-submit-url",
      required: true,
      description: `Submit POST exact URL ${POW_SUBMIT_URL}`,
    },
    {
      id: "secure-https-controls",
      required: true,
      description:
        "TLS verify+SNI, public DNS IP pin, no redirects/retries, timeout+byte caps, no cookies/creds/payment headers",
    },
    {
      id: "challenge-artifact",
      required: true,
      description:
        "Persisted challenge request/response (sanitized headers) + body SHA-256",
    },
    {
      id: "solution-artifact",
      required: true,
      description:
        "Persisted solution metadata (token redaction policy, nonce, attempts, digestHex, difficultyBits) — not a reusable secret store",
    },
    {
      id: "submit-artifact",
      required: true,
      description:
        "Persisted POST request body SHA-256 (JSONVALIDATE-002 fixture), response snapshot + SHA-256, redacted headers",
    },
    {
      id: "envelope-match",
      required: true,
      description: `Response envelope equals ${JSON.stringify(POW_EXPECTED_ENVELOPE)} (extra keys recorded, not required)`,
    },
    {
      id: "independent-validation",
      required: true,
      description:
        "Local independent schema check agrees valid=true for the Alice/age fixture",
    },
    {
      id: "no-payment-path",
      required: true,
      description:
        "No PAYMENT-SIGNATURE / wallet / facilitator / RPC / Sepolia USDC involvement",
    },
    {
      id: "ladder-claim-guard",
      required: true,
      description:
        "providerExecutionVerified=true only when networkLive && !simulationOnly; never promote fake transport to L3",
    },
  ] as const;

export function l3ClaimAllowed(input: {
  readonly networkChallengePerformed: boolean;
  readonly networkSubmitPerformed: boolean;
  readonly simulationOnly: boolean;
  readonly providerExecutionVerified: boolean;
  readonly envelopeValid: boolean;
  readonly markersWritten: boolean;
  readonly liveAuthorizationGranted: boolean;
}): { readonly allowed: boolean; readonly observedLevel: PowLadderLevel; readonly blockers: readonly string[] } {
  const blockers: string[] = [];
  if (input.simulationOnly) blockers.push("simulationOnly");
  if (!input.liveAuthorizationGranted) blockers.push("liveAuthorizationMissing");
  if (!input.markersWritten) blockers.push("markersMissing");
  if (!input.networkChallengePerformed) blockers.push("challengeNetworkMissing");
  if (!input.networkSubmitPerformed) blockers.push("submitNetworkMissing");
  if (!input.envelopeValid) blockers.push("envelopeInvalid");
  if (!input.providerExecutionVerified) blockers.push("providerNotVerified");
  return {
    allowed: blockers.length === 0,
    observedLevel: blockers.length === 0 ? "L3" : "L2",
    blockers,
  };
}
