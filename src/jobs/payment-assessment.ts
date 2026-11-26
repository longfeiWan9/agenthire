/**
 * Offline payment assessment for HireJob synthetic fixtures (D5.2).
 *
 * Reuses x402 challenge parser + offer policy. Never signs, settles,
 * or contacts facilitators. Distinct payment statuses only.
 */

import { parseHttp402Challenge } from "../x402/challenge-parser.ts";
import { evaluateOfferPolicy } from "../x402/offer-policy.ts";
import type { HireJobPaymentView } from "./types.ts";
import type { SyntheticHttpFixture } from "./fixtures.ts";
import { FIXTURE_KIND } from "./fixtures.ts";

export function assessSyntheticPaymentFixture(
  http: SyntheticHttpFixture | null,
): HireJobPaymentView {
  if (!http) {
    return {
      status: "notApplicable",
      parseOk: null,
      policyCompatible: null,
      paymentApprovalGranted: false,
      note: "No HTTP fixture — payment not applicable",
    };
  }

  if (http.httpStatus !== 402) {
    return {
      status: "challengeAbsent",
      parseOk: null,
      policyCompatible: null,
      paymentApprovalGranted: false,
      note: `HTTP ${http.httpStatus} — no payment challenge expected`,
    };
  }

  const parsed = parseHttp402Challenge({
    fixtureKind: FIXTURE_KIND,
    httpStatus: http.httpStatus,
    headers: http.headers,
    body: http.body,
  });

  if (!parsed.ok) {
    return {
      status: "parseFailed",
      parseOk: false,
      policyCompatible: null,
      paymentApprovalGranted: false,
      note: `challenge parse failed: ${parsed.reason}`,
    };
  }

  // Explicitly unapproved — structural compatibility ≠ payment authorization.
  const policy = evaluateOfferPolicy(parsed, {
    paymentApprovalGranted: false,
  });

  if (!policy.anyStructurallyCompatible) {
    const codes = policy.evaluations.flatMap((e) => e.reasonCodes);
    return {
      status: "policyIncompatible",
      parseOk: true,
      policyCompatible: false,
      paymentApprovalGranted: false,
      note: `policy structurally incompatible: ${codes.join(",")}`,
    };
  }

  // Structurally compatible dual-network offer still unauthorized without approval.
  // anyPolicyPass remains false while paymentApprovalGranted is false.
  return {
    status: "policyCompatibleUnapproved",
    parseOk: true,
    policyCompatible: true,
    paymentApprovalGranted: false,
    note: "Structurally compatible approved-network offer — paymentApprovalGranted=false; NO PAYMENT WAS MADE; paidVerified remains false",
  };
}
