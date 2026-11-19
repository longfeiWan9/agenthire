/**
 * AgentHire Provider Catalog & Verification Evidence types (D3.6).
 *
 * Copied exactly from docs/specifications/MVP-contracts.md §B3 / §B4
 * (ProviderRecord@1.0, VerificationEvidence@1.0). Do not invent fields.
 *
 * Mode: READ_ONLY / NO_SIGNING — types only; no RPC/HTTP.
 */

export type Address = string;

export type ProviderOrigin = "external" | "selfHostedFallback";

export type VerificationStatus =
  | "notChecked"
  | "verified"
  | "failed"
  | "inconclusive";

export type ProviderService = {
  serviceId: string;
  endpointUrl: string;

  method: "GET" | "POST" | "OTHER";

  description: string | null;
  claimedTaskTypes: string[];

  endpointStatus: VerificationStatus;
  requestSchemaStatus: VerificationStatus;
};

export type ObservedPaymentOffer = {
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

export type ProviderRecord = {
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

    fetchStatus: "notFetched" | "success" | "failed";

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

export type CheckResult =
  | "notChecked"
  | "passed"
  | "failed"
  | "inconclusive"
  | "stale";

export type VerificationCheck =
  | "registryIdentity"
  | "registrationMetadata"
  | "endpointReachability"
  | "taskRequestCompatibility"
  | "taskResponseCompatibility"
  | "x402Challenge"
  | "paymentPolicy"
  | "paidExecution";

export type CheckSnapshot = {
  result: CheckResult;
  checkedAt: string | null;
  evidenceIds: string[];
  reasonCode?: string;
};

export type ProviderVerification = {
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

  availability: "unknown" | "available" | "blocked";

  evaluatedAt: string;
};

export type EvidenceKind =
  | "registryRead"
  | "metadataFetch"
  | "endpointProbe"
  | "x402Challenge"
  | "taskSchemaCheck"
  | "paymentPolicyCheck"
  | "paymentSettlement"
  | "providerResponse";

export type VerificationEvidence = {
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

/** Bundle written by `pnpm build:catalog`. */
export type ProviderCatalogDocument = {
  schemaVersion: "1.0";
  mode: "READ_ONLY / NO_SIGNING";
  generatedAt: string;
  source: {
    registryEvidencePath: string;
    metadataEvidencePath: string;
  };
  providerCount: number;
  providers: ProviderRecord[];
};

export type ProviderVerificationDocument = {
  schemaVersion: "1.0";
  mode: "READ_ONLY / NO_SIGNING";
  generatedAt: string;
  /** Day 3 upper bound: metadataValidated */
  maxSupportedMilestone: "metadataValidated";
  evidenceCount: number;
  verificationCount: number;
  evidences: VerificationEvidence[];
  verifications: ProviderVerification[];
};

export type CatalogDiagnosticsDocument = {
  schemaVersion: "1.0";
  generatedAt: string;
  incompleteServiceClaims: {
    providerId: string;
    reason: string;
    claim: unknown;
  }[];
  joinNotes: string[];
};
