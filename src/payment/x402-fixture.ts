/**
 * Offline x402 v2 PaymentRequired + erc7710 PaymentPayload fixtures (D8.2-B).
 * Synthetic only — no captured live headers, no signing with real keys.
 */

import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
  MVP_TASK_ID,
} from "../x402/challenge-types.ts";
import {
  DELEGATION_MANAGER_ADDRESS,
  type PermissionContext,
} from "./delegation-manager.ts";
import { TEST_ACCOUNTS } from "./local-evm.ts";

export const X402_PAYMENT_FIXTURE_VERSION = "1.0" as const;

export type ExactErc7710PaymentRequired = {
  readonly x402Version: typeof APPROVED_X402_VERSION;
  readonly error: string;
  readonly accepts: readonly [
    {
      readonly scheme: typeof APPROVED_X402_SCHEME;
      readonly network: typeof APPROVED_PAYMENT_NETWORK;
      readonly maxAmountRequired: string;
      readonly asset: typeof APPROVED_SEPOLIA_TEST_USDC;
      readonly payTo: string;
      readonly resource: string;
      readonly description: string;
      readonly mimeType: "application/json";
      readonly maxTimeoutSeconds: number;
      readonly extra: {
        readonly assetTransferMethod: "erc7710";
        readonly name: "USDC";
        readonly version: "2";
      };
    },
  ];
};

export type ExactErc7710PaymentPayload = {
  readonly x402Version: typeof APPROVED_X402_VERSION;
  readonly resource: {
    readonly url: string;
    readonly description: string;
    readonly mimeType: "application/json";
  };
  readonly accepted: {
    readonly scheme: typeof APPROVED_X402_SCHEME;
    readonly network: typeof APPROVED_PAYMENT_NETWORK;
    readonly amount: string;
    readonly asset: typeof APPROVED_SEPOLIA_TEST_USDC;
    readonly payTo: string;
    readonly maxTimeoutSeconds: number;
    readonly extra: {
      readonly assetTransferMethod: "erc7710";
      readonly name: "USDC";
      readonly version: "2";
    };
  };
  readonly payload: {
    readonly delegationManager: string;
    readonly permissionContext: PermissionContext;
    readonly delegator: string;
  };
};

export function buildWalletActivityPaymentRequired(input: {
  readonly amountAtomic: bigint;
  readonly payTo?: string;
}): ExactErc7710PaymentRequired {
  return {
    x402Version: APPROVED_X402_VERSION,
    error: "PAYMENT-SIGNATURE header is required",
    accepts: [
      {
        scheme: APPROVED_X402_SCHEME,
        network: APPROVED_PAYMENT_NETWORK,
        maxAmountRequired: input.amountAtomic.toString(),
        asset: APPROVED_SEPOLIA_TEST_USDC,
        payTo: input.payTo ?? TEST_ACCOUNTS.payTo,
        resource: `https://example.test/v1/${MVP_TASK_ID}`,
        description: `Offline fixture for ${MVP_TASK_ID}`,
        mimeType: "application/json",
        maxTimeoutSeconds: 60,
        extra: {
          assetTransferMethod: "erc7710",
          name: "USDC",
          version: "2",
        },
      },
    ],
  };
}

export function buildErc7710PaymentPayload(input: {
  readonly amountAtomic: bigint;
  readonly permissionContext: PermissionContext;
  readonly payTo?: string;
  readonly delegator?: string;
}): ExactErc7710PaymentPayload {
  const payTo = input.payTo ?? TEST_ACCOUNTS.payTo;
  const resourceUrl = `https://example.test/v1/${MVP_TASK_ID}`;
  return {
    x402Version: APPROVED_X402_VERSION,
    resource: {
      url: resourceUrl,
      description: `Offline fixture for ${MVP_TASK_ID}`,
      mimeType: "application/json",
    },
    accepted: {
      scheme: APPROVED_X402_SCHEME,
      network: APPROVED_PAYMENT_NETWORK,
      amount: input.amountAtomic.toString(),
      asset: APPROVED_SEPOLIA_TEST_USDC,
      payTo,
      maxTimeoutSeconds: 60,
      extra: {
        assetTransferMethod: "erc7710",
        name: "USDC",
        version: "2",
      },
    },
    payload: {
      delegationManager: DELEGATION_MANAGER_ADDRESS,
      permissionContext: input.permissionContext,
      delegator: input.delegator ?? TEST_ACCOUNTS.delegator,
    },
  };
}

/** Encode PaymentRequired for PAYMENT-REQUIRED header (base64 JSON). */
export function encodePaymentRequiredHeader(
  body: ExactErc7710PaymentRequired,
): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}
