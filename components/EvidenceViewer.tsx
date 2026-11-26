import type { EvidenceLadderView } from "../src/marketplace/evidence-ladder.ts";
import type { ExecutionLifecycleView } from "../src/marketplace/execution-lifecycle.ts";
import type { SanitizedEvidenceView } from "../src/ui/evidence-sanitizer.ts";
import { SIMULATION_RESULT_BANNER } from "../src/ui/trust-labels.ts";

export function EvidenceViewer(props: {
  readonly lifecycle: ExecutionLifecycleView;
  readonly ladder: EvidenceLadderView;
  readonly evidence: SanitizedEvidenceView | null;
  readonly evidenceJson: string | null;
  readonly fixtureKind: string | null;
  readonly fixtureOk: boolean | null;
}) {
  return (
    <section
      className="hire-step-panel"
      aria-labelledby="evidence-viewer-heading"
      data-testid="evidence-viewer"
    >
      <h3 id="evidence-viewer-heading">Evidence viewer</h3>
      <p className="mono">
        lifecycle={props.lifecycle.status}; phase={props.lifecycle.phase};
        ladder={props.lifecycle.evidenceLadder}; liveExecution=
        {String(props.lifecycle.liveExecutionAuthorized)}; livePayment=
        {String(props.lifecycle.livePaymentAuthorized)}
      </p>

      <ol className="evidence-ladder" aria-label="Evidence ladder L0 to L4">
        {props.ladder.rungs.map((rung) => (
          <li
            key={rung.level}
            className={rung.reached ? "reached" : undefined}
            aria-current={
              rung.level === props.ladder.current ? "step" : undefined
            }
          >
            <strong>{rung.level}</strong> {rung.title}
            <span className="mono"> — {rung.meaning}</span>
          </li>
        ))}
      </ol>
      <p className="mono" role="note">
        simulationUpgradesLadder=
        {String(props.ladder.simulationUpgradesLadder)}
      </p>

      <div className="sim-banner" role="alert">
        {props.evidence?.banner ?? SIMULATION_RESULT_BANNER}
      </div>

      {props.evidence ? (
        <>
          <dl>
            <dt>simulated</dt>
            <dd>{String(props.evidence.simulated)}</dd>
            <dt>providerExecutionVerified</dt>
            <dd>{String(props.evidence.providerExecutionVerified)}</dd>
            <dt>secretsRedacted</dt>
            <dd>{props.evidence.secretsRedacted}</dd>
            <dt>fixture</dt>
            <dd>{props.fixtureKind ?? "—"}</dd>
            <dt>fixtureOk</dt>
            <dd>
              {props.fixtureOk == null ? "—" : String(props.fixtureOk)}
            </dd>
          </dl>
          <pre
            className="mono evidence-json"
            style={{ whiteSpace: "pre-wrap" }}
            data-testid="evidence-json"
          >
            {props.evidenceJson ?? "{}"}
          </pre>
        </>
      ) : (
        <p className="mono">
          Run an offline fixture to populate sanitized evidence. No secrets are
          stored or displayed.
        </p>
      )}
    </section>
  );
}
