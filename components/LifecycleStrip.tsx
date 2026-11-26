import {
  MARKETPLACE_PHASES,
  MARKETPLACE_PHASE_LABELS,
  phaseIndex,
  type ExecutionLifecycleView,
  type MarketplacePhase,
} from "../src/marketplace/execution-lifecycle.ts";

export function LifecycleStrip(props: {
  readonly lifecycle: ExecutionLifecycleView;
  /** Optional override when browsing Discover/Evaluate outside hire. */
  readonly highlightPhase?: MarketplacePhase;
}) {
  const active = props.highlightPhase ?? props.lifecycle.phase;
  const activeIdx = phaseIndex(active);

  return (
    <div className="lifecycle-panel" data-testid="lifecycle-strip">
      <ol className="hire-steps lifecycle-steps" aria-label="Marketplace vertical slice">
        {MARKETPLACE_PHASES.map((phase, index) => (
          <li
            key={phase}
            className={
              index === activeIdx ? "active" : index < activeIdx ? "done" : undefined
            }
            aria-current={index === activeIdx ? "step" : undefined}
          >
            <span className="hire-step-index">{index + 1}</span>
            {MARKETPLACE_PHASE_LABELS[phase]}
          </li>
        ))}
      </ol>
      <p className="mono lifecycle-meta">
        status={props.lifecycle.status}; evidenceLadder=
        {props.lifecycle.evidenceLadder}; simulationOnly=
        {String(props.lifecycle.simulationOnly)}; offline UI approval ≠ live
        auth
      </p>
    </div>
  );
}
