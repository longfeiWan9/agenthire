"use client";

import { useState, useTransition } from "react";
import type { HireJobFixtureKind } from "../src/jobs/types.ts";
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

const FIXTURES: readonly HireJobFixtureKind[] = [
  "success-aapl",
  "invalid-input-empty",
  "invalid-input-url",
  "provider-error-4xx",
  "provider-error-5xx",
  "incompatible-payment-402",
  "compatible-payment-unapproved-402",
];

export function HireConsole(props: {
  readonly capabilityId: string;
  readonly initial: HireSessionSnapshot;
  readonly displayName: string;
}) {
  const [session, setSession] = useState(props.initial);
  const [kind, setKind] = useState<"ticker" | "companyName">("ticker");
  const [value, setValue] = useState("AAPL");
  const [fixture, setFixture] = useState<HireJobFixtureKind>("success-aapl");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<HireSessionSnapshot | null>) {
    startTransition(async () => {
      const next = await action();
      if (next) setSession(next);
    });
  }

  if (!session.supported) {
    return (
      <section className="panel" aria-labelledby="hire-console-heading">
        <h2 id="hire-console-heading">Hire console</h2>
        <div className="callout danger" role="status">
          {session.blockReason}
        </div>
        <p>
          This capability is discoverable in the local catalog, but live hiring
          and offline simulation are not available here. No generic executor.
        </p>
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
        Offline hire console — {props.displayName}
      </h2>
      <p className="mono">capabilityId={props.capabilityId}</p>
      <div className="callout" role="note">
        Live quote unavailable. Interface undocumented. Payment unavailable /
        unverified. Simulation only — QuantJourney did not return these results.
      </div>
      <div className="callout" role="note" data-testid="hire-task-guidance">
        <strong>Task:</strong> resolve a US public-company identity offline
        (SEC-style demo). No provider HTTP, signing, or payment runs from this
        console.
        <ol style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
          <li>
            Enter a ticker (e.g. <span className="mono">AAPL</span>) or company
            name, then <strong>Validate input</strong>.
          </li>
          <li>
            <strong>Create HireJob</strong> — live quote stays unavailable;
            changing input clears prior approval state.
          </li>
          <li>
            Optionally reveal a labeled synthetic quote and practice simulation
            approve / reject / modified fingerprint.
          </li>
          <li>
            Run a named offline fixture — results always carry the simulation
            banner and <span className="mono">providerExecutionVerified=false</span>.
          </li>
        </ol>
      </div>

      <div className="hire-form">
        <label htmlFor="hire-kind">
          Input kind
          <select
            id="hire-kind"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value === "companyName" ? "companyName" : "ticker")
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
          Local validation only — URLs and empty values are rejected.
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
        {session.input ? (
          <p className="mono">
            configured: {JSON.stringify(session.input)}
          </p>
        ) : null}
      </div>

      {session.job ? (
        <div style={{ marginTop: "1rem" }}>
          <h3>HireJob</h3>
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
        </div>
      ) : null}

      {session.liveQuote ? (
        <div style={{ marginTop: "1rem" }}>
          <h3>Live quote status</h3>
          <div className="callout danger" role="status">
            Live quote unavailable —{" "}
            {session.liveQuote.notes[0] ?? "unknown interface"}
          </div>
          <p className="mono">
            status={session.liveQuote.status}; paymentReady=
            {String(session.liveQuote.paymentReady)}; amount.unknown=
            {String(session.liveQuote.amount.unknown)}
          </p>
        </div>
      ) : null}

      <div style={{ marginTop: "1rem" }}>
        <h3>Synthetic quote &amp; approval (labeled)</h3>
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
            onClick={() => run(() => actionModifiedBinding(props.capabilityId))}
          >
            Try modified fingerprint
          </button>
          <button
            type="button"
            className="secondary"
            disabled={pending || !session.session}
            aria-disabled={pending || !session.session}
            onClick={() => run(() => actionRevokeApproval(props.capabilityId))}
          >
            Revoke approval
          </button>
        </div>
        {session.syntheticQuoteRevealed && session.syntheticQuote ? (
          <p className="mono">
            SYNTHETIC quote status={session.syntheticQuote.status}; amount=
            {session.syntheticQuote.amount.displayUsdc ?? "unknown"};
            paymentReady={String(session.syntheticQuote.paymentReady)};
            provenance={session.syntheticQuote.provenance}
          </p>
        ) : null}
        {session.session ? (
          <p className="mono">
            approval.state={session.session.state};
            executionAuthorization=
            {String(session.session.flags.executionAuthorization)};
            paymentExecutionAuthorization=
            {String(session.session.flags.paymentExecutionAuthorization)}
          </p>
        ) : null}
      </div>

      {session.actionFeedback ? (
        <div
          className={
            /ok=false|failed|Revoke|rejected|empty:|invalid/i.test(
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

      <div style={{ marginTop: "1rem" }}>
        <h3>Run named offline fixture</h3>
        <div className="hire-actions">
          <label htmlFor="hire-fixture">
            Fixture kind
            <select
              id="hire-fixture"
              value={fixture}
              onChange={(e) => setFixture(e.target.value as HireJobFixtureKind)}
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
      </div>

      {session.banner || session.fixtureResult ? (
        <div className="sim-banner" role="alert">
          {session.banner ?? SIMULATION_RESULT_BANNER}
        </div>
      ) : null}

      {session.fixtureResult ? (
        <div>
          <h3>Fixture result</h3>
          <p className="mono">
            kind={session.fixtureResult.kind}; ok=
            {String(session.fixtureResult.ok)}; status=
            {session.fixtureResult.job.status}; providerExecutionVerified=
            {String(
              session.fixtureResult.job.result.providerExecutionVerified,
            )}
          </p>
          <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(session.fixtureResult.job.result.payload, null, 2)}
          </pre>
        </div>
      ) : null}

      {session.notes.length > 0 ? (
        <details style={{ marginTop: "1rem" }} open={Boolean(session.actionFeedback)}>
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
