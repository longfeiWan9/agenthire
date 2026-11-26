"use client";

import { useMemo, useState, useTransition } from "react";
import type { HireJobFixtureKind } from "../src/jobs/types.ts";
import {
  buildAgent402PowDisplayView,
  formatPowDisplayStatus,
} from "../src/marketplace/d73-display-adapter.ts";
import {
  assessEvidenceLadder,
  type EvidenceLadderView,
} from "../src/marketplace/evidence-ladder.ts";
import type { ServiceCapability } from "../src/marketplace/types.ts";
import type { HireSessionSnapshot } from "../src/ui/hire-session.ts";
import { SIMULATION_RESULT_BANNER } from "../src/ui/trust-labels.ts";
import {
  actionConfigureHire,
  actionCreateHireJob,
  actionModifiedBinding,
  actionRevealSyntheticQuote,
  actionRevokeApproval,
  actionRunFixture,
  actionSimulateApprove,
  actionSimulateReject,
} from "../src/ui/hire-actions.ts";
import { EvidenceViewer } from "./EvidenceViewer.tsx";
import { LifecycleStrip } from "./LifecycleStrip.tsx";

const FIXTURES: readonly HireJobFixtureKind[] = [
  "success-aapl",
  "invalid-input-empty",
  "invalid-input-url",
  "provider-error-4xx",
  "provider-error-5xx",
  "incompatible-payment-402",
  "compatible-payment-unapproved-402",
];

const HIRE_STEPS = [
  "Understand",
  "Enter inputs",
  "Review quote",
  "Approve / reject",
  "Simulated result",
] as const;

const FALLBACK_LADDER: EvidenceLadderView = {
  current: "L0",
  rungs: [
    {
      level: "L0",
      title: "Advertised / discovery only",
      meaning: "Local catalog evidence only.",
      reached: true,
    },
    {
      level: "L1",
      title: "Documented interface",
      meaning: "Not reached offline.",
      reached: false,
    },
    {
      level: "L2",
      title: "Reachability observed",
      meaning: "Not reached offline.",
      reached: false,
    },
    {
      level: "L3",
      title: "Authorized gated attempt",
      meaning: "Not reached offline.",
      reached: false,
    },
    {
      level: "L4",
      title: "Provider-verified hire outcome",
      meaning: "Not available offline.",
      reached: false,
    },
  ],
  simulationUpgradesLadder: false,
  notes: ["Fallback ladder — capability record not supplied"],
};

function activeHireStep(session: HireSessionSnapshot): number {
  if (session.fixtureResult) return 4;
  if (session.session) return 3;
  if (session.liveQuote || session.syntheticQuoteRevealed) return 2;
  if (session.job || session.input) return 1;
  return 0;
}

export function HireConsole(props: {
  readonly capabilityId: string;
  readonly initial: HireSessionSnapshot;
  readonly displayName: string;
  readonly capabilityRecord?: ServiceCapability | null;
}) {
  const [session, setSession] = useState(props.initial);
  const [kind, setKind] = useState<"ticker" | "companyName">("ticker");
  const [value, setValue] = useState("AAPL");
  const [fixture, setFixture] = useState<HireJobFixtureKind>("success-aapl");
  const [pending, startTransition] = useTransition();
  const step = useMemo(() => activeHireStep(session), [session]);
  const ladder = useMemo(
    () =>
      props.capabilityRecord
        ? assessEvidenceLadder(props.capabilityRecord)
        : FALLBACK_LADDER,
    [props.capabilityRecord],
  );
  const agent402 = useMemo(() => buildAgent402PowDisplayView(), []);

  function run(action: () => Promise<HireSessionSnapshot | null>) {
    startTransition(async () => {
      const next = await action();
      if (next) setSession(next);
    });
  }

  if (!session.supported) {
    return (
      <section className="panel" aria-labelledby="hire-console-heading">
        <h2 id="hire-console-heading">Guided hire unavailable</h2>
        <LifecycleStrip lifecycle={session.lifecycle} highlightPhase="evaluate" />
        <div className="callout danger" role="status">
          {session.blockReason}
        </div>
        <p>
          This capability is discoverable in the local catalog, but live hiring
          and offline simulation are not available here. No input schema is
          invented when adapters are absent. No generic executor.
        </p>

        <section aria-labelledby="auth-distinctions-heading">
          <h3 id="auth-distinctions-heading">Authorization distinctions</h3>
          <p className="mono">{formatPowDisplayStatus(agent402.status)}</p>
          <ul>
            {agent402.distinctions.map((d) => (
              <li key={d.kind}>
                <strong>{d.label}</strong> — {d.note} (liveExecution=
                {String(d.meansLiveExecution)}; livePayment=
                {String(d.meansLivePayment)})
              </li>
            ))}
          </ul>
          <div className="callout" role="note">
            Offline UI approval ≠ live auth. Agent402 PoW ≠ x402 payment. D7.3
            PoW runtime is display-only here (not merged).
          </div>
        </section>
      </section>
    );
  }

  return (
    <section
      className="panel"
      aria-labelledby="hire-console-heading"
      aria-busy={pending}
    >
      <h2 id="hire-console-heading">
        Guided offline hire — {props.displayName}
      </h2>
      <p className="mono">capabilityId={props.capabilityId}</p>

      <LifecycleStrip lifecycle={session.lifecycle} />

      <ol className="hire-steps" aria-label="Hire progress">
        {HIRE_STEPS.map((label, index) => (
          <li
            key={label}
            className={
              index === step ? "active" : index < step ? "done" : undefined
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span className="hire-step-index">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="callout" role="note">
        Live quote unavailable. Interface undocumented. Payment unavailable /
        unverified. Simulation only — QuantJourney did not return these results.
        Offline UI approval ≠ live authorization.
      </div>

      <section
        className="hire-step-panel"
        aria-labelledby="hire-step-1"
        data-testid="hire-task-guidance"
      >
        <h3 id="hire-step-1">1. Understand this capability</h3>
        <p>
          <strong>Task:</strong> resolve a US public-company identity offline
          (SEC-style demo). The adapter validates a ticker or company name
          locally, creates a HireJob, and can run named offline fixtures.
          Nothing is signed or paid.
        </p>
        <dl>
          <dt>Expected result</dt>
          <dd>
            A simulated company identity payload labeled as not returned by an
            external provider.
          </dd>
          <dt>Required inputs</dt>
          <dd>
            Exactly one of <span className="mono">ticker</span> or{" "}
            <span className="mono">companyName</span>. Empty values and URLs are
            rejected.
          </dd>
          <dt>Safe examples</dt>
          <dd>
            <span className="mono">AAPL</span>,{" "}
            <span className="mono">MSFT</span>,{" "}
            <span className="mono">Apple Inc.</span>
          </dd>
          <dt>Evidence ladder</dt>
          <dd>
            {ladder.current} — simulation never upgrades ladder (
            {String(ladder.simulationUpgradesLadder)})
          </dd>
        </dl>
      </section>

      <section className="hire-step-panel" aria-labelledby="hire-step-2">
        <h3 id="hire-step-2">2. Enter inputs</h3>
        <div className="hire-form">
          <label htmlFor="hire-kind">
            Input kind
            <select
              id="hire-kind"
              value={kind}
              onChange={(e) =>
                setKind(
                  e.target.value === "companyName" ? "companyName" : "ticker",
                )
              }
            >
              <option value="ticker">ticker</option>
              <option value="companyName">companyName</option>
            </select>
          </label>
          <label htmlFor="hire-value">
            {kind === "ticker" ? "Ticker symbol" : "Company name"}
            <input
              id="hire-value"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              placeholder={kind === "ticker" ? "AAPL" : "Apple Inc."}
              aria-describedby="hire-value-hint"
            />
          </label>
          <p id="hire-value-hint" className="mono">
            Local validation only — URLs and empty values are rejected. Changing
            sensitive input after approval clears prior approval state.
          </p>
          <div className="hire-actions">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => actionConfigureHire(props.capabilityId, kind, value))
              }
            >
              Validate input
            </button>
            <button
              type="button"
              disabled={pending || !session.input}
              aria-disabled={pending || !session.input}
              title={
                session.input
                  ? "Create offline HireJob"
                  : "Validate ticker or companyName first"
              }
              onClick={() => run(() => actionCreateHireJob(props.capabilityId))}
            >
              Create HireJob
            </button>
          </div>
          {session.validationError ? (
            <div className="callout danger" role="alert">
              {session.validationError}
            </div>
          ) : null}
          {session.authorizationInvalidated ? (
            <div className="callout danger" role="status" data-testid="auth-invalidated">
              Prior simulation approval invalidated after sensitive input change.
              Offline UI approval ≠ live auth.
            </div>
          ) : null}
          {session.input ? (
            <p className="mono">configured: {JSON.stringify(session.input)}</p>
          ) : null}
        </div>
      </section>

      {session.job ? (
        <section className="hire-step-panel" aria-labelledby="hire-step-job">
          <h3 id="hire-step-job">HireJob</h3>
          <dl>
            <dt>hireJobId</dt>
            <dd>{session.job.hireJobId}</dd>
            <dt>status</dt>
            <dd>{session.job.status}</dd>
            <dt>adapterId</dt>
            <dd>{session.job.adapterId}</dd>
            <dt>quoteReason</dt>
            <dd>{session.job.quoteReason ?? "—"}</dd>
            <dt>paidVerified</dt>
            <dd>{String(session.job.flags.paidVerified)}</dd>
            <dt>approvedForNetworkExecution</dt>
            <dd>{String(session.job.flags.approvedForNetworkExecution)}</dd>
          </dl>
        </section>
      ) : null}

      <section className="hire-step-panel" aria-labelledby="hire-step-3">
        <h3 id="hire-step-3">3. Review quote / authorization boundary</h3>
        {session.liveQuote ? (
          <div className="callout danger" role="status">
            Live quote unavailable —{" "}
            {session.liveQuote.notes[0] ?? "unknown interface"}
          </div>
        ) : (
          <p className="mono">
            Live quote stays unavailable for this capability.
          </p>
        )}
        <ul className="auth-distinctions">
          <li>
            <strong>Offline UI approval</strong> — local simulation only; never
            live execution or payment.
          </li>
          <li>
            <strong>x402 payment challenge</strong> — payment-required offer
            parsing; distinct from PoW; stays unauthorized offline.
          </li>
          <li>
            <strong>Agent402 PoW</strong> — separate gated path (D7.3 display
            only here); not payment settlement.
          </li>
        </ul>
        <div className="hire-actions">
          <button
            type="button"
            className="secondary"
            disabled={pending || !session.job}
            aria-disabled={pending || !session.job}
            onClick={() =>
              run(() => actionRevealSyntheticQuote(props.capabilityId))
            }
          >
            Reveal synthetic quote
          </button>
        </div>
        {session.syntheticQuoteRevealed && session.syntheticQuote ? (
          <div className="quote-card" data-testid="synthetic-quote-card">
            <p className="mono">
              SYNTHETIC quote status={session.syntheticQuote.status}; amount=
              {session.syntheticQuote.amount.displayUsdc ?? "unknown"};
              paymentReady={String(session.syntheticQuote.paymentReady)};
              provenance={session.syntheticQuote.provenance};
              executionAuthorization=
              {String(session.syntheticQuote.executionAuthorization)};
              paymentExecutionAuthorization=
              {String(session.syntheticQuote.paymentExecutionAuthorization)}
            </p>
          </div>
        ) : null}
      </section>

      <section className="hire-step-panel" aria-labelledby="hire-step-4">
        <h3 id="hire-step-4">4. Approve / reject (simulation ≠ live auth)</h3>
        <div className="hire-actions">
          <button
            type="button"
            disabled={pending || !session.session}
            aria-disabled={pending || !session.session}
            onClick={() => run(() => actionSimulateApprove(props.capabilityId))}
          >
            Simulation approve
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending || !session.session}
            aria-disabled={pending || !session.session}
            onClick={() => run(() => actionSimulateReject(props.capabilityId))}
          >
            Simulation reject
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending || !session.session}
            aria-disabled={pending || !session.session}
            onClick={() =>
              run(() => actionModifiedBinding(props.capabilityId))
            }
          >
            Try modified fingerprint
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending || !session.session}
            aria-disabled={pending || !session.session}
            onClick={() =>
              run(() => actionRevokeApproval(props.capabilityId))
            }
          >
            Revoke approval
          </button>
        </div>
        {session.session ? (
          <p className="mono">
            approval.state={session.session.state};
            executionAuthorization=
            {String(session.session.flags.executionAuthorization)};
            paymentExecutionAuthorization=
            {String(session.session.flags.paymentExecutionAuthorization)};
            simulationOnly={String(session.session.flags.simulationOnly)}
          </p>
        ) : (
          <p className="mono">
            Reveal a synthetic quote first to practice approval states.
          </p>
        )}
      </section>

      {session.actionFeedback ? (
        <div
          className={
            /ok=false|failed|Revoke|rejected|empty:|invalid|invalidat/i.test(
              session.actionFeedback,
            )
              ? "callout danger"
              : "callout"
          }
          role="status"
          data-testid="hire-action-feedback"
        >
          {session.actionFeedback}
        </div>
      ) : null}

      <section className="hire-step-panel" aria-labelledby="hire-step-5">
        <h3 id="hire-step-5">5. Execute simulated result</h3>
        <div className="hire-actions">
          <label htmlFor="hire-fixture">
            Fixture kind
            <select
              id="hire-fixture"
              value={fixture}
              onChange={(e) =>
                setFixture(e.target.value as HireJobFixtureKind)
              }
            >
              {FIXTURES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => actionRunFixture(props.capabilityId, fixture))
            }
          >
            Run fixture
          </button>
        </div>
      </section>

      {session.banner || session.fixtureResult ? (
        <div className="sim-banner" role="alert">
          {session.banner ?? SIMULATION_RESULT_BANNER}
        </div>
      ) : null}

      <EvidenceViewer
        lifecycle={session.lifecycle}
        ladder={ladder}
        evidence={session.evidenceView}
        evidenceJson={session.evidenceJson}
        fixtureKind={session.fixtureResult?.kind ?? null}
        fixtureOk={session.fixtureResult?.ok ?? null}
      />

      {session.notes.length > 0 ? (
        <details
          style={{ marginTop: "1rem" }}
          open={Boolean(session.actionFeedback)}
        >
          <summary>Session notes</summary>
          <ul>
            {session.notes.map((n, i) => (
              <li key={`${i}-${n.slice(0, 48)}`} className="mono">
                {n}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
