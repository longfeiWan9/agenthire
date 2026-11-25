import Link from "next/link";
import type { AgentPresentation } from "../src/marketplace/agent-directory.ts";
import { getCategoryDefinition } from "../src/marketplace/categories.ts";

export function AgentCard(props: {
  readonly agent: AgentPresentation;
  readonly matchExplanation?: string;
  readonly showCapabilities?: boolean;
  readonly maxCapabilities?: number;
}) {
  const {
    agent,
    matchExplanation,
    showCapabilities = true,
    maxCapabilities = 3,
  } = props;
  const categories = agent.categories
    .map((id) => getCategoryDefinition(id).name)
    .slice(0, 3)
    .join(", ");
  const caps = agent.capabilities.slice(0, maxCapabilities);
  const href = `/agents/${encodeURIComponent(agent.agentIdentityKey)}`;

  return (
    <article className="agent-card">
      <header className="agent-card-header">
        <h3>
          <Link href={href}>{agent.displayName}</Link>
        </h3>
        <p className="agent-card-origin">{agent.originLabel}</p>
      </header>
      <div className="meta-tags" aria-label="Agent labels">
        <span className="tag">{agent.registrationNetwork.shortLabel}</span>
        <span className="tag">
          {agent.registered ? "Registered identity" : "Unlinked / exploratory"}
        </span>
        {categories ? <span className="tag">{categories}</span> : null}
        <span className="tag">
          {agent.curatedCapabilityCount} curated · {agent.totalCapabilityCount}{" "}
          advertised
        </span>
        {agent.hasOfflineDemo ? (
          <span className="tag ok">Offline demo available</span>
        ) : null}
      </div>
      {matchExplanation ? (
        <p className="match-explain" data-testid="match-explanation">
          {matchExplanation}
        </p>
      ) : null}
      {agent.linkageWarnings.length > 0 ? (
        <div className="callout" role="note">
          {agent.linkageWarnings[0]}
        </div>
      ) : null}
      {showCapabilities && caps.length > 0 ? (
        <ul className="agent-cap-list">
          {caps.map((cap) => (
            <li key={cap.record.capabilityId}>
              <Link
                href={`/capabilities/${encodeURIComponent(cap.record.capabilityId)}`}
              >
                {cap.quality.publicTitle}
              </Link>
              <span className="mono">
                {" "}
                · {cap.quality.publicReadiness}
                {cap.quality.qualifiesCurated ? "" : " · incomplete"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <Link className="btn secondary" href={href}>
          View agent profile
        </Link>
      </p>
    </article>
  );
}
