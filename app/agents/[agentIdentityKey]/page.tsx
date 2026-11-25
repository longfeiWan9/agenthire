import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryDefinition } from "../../../src/marketplace/categories.ts";
import {
  getAgentByIdentityKey,
  isSafeAgentIdentityKey,
} from "../../../src/ui/catalog-store.ts";
import {
  PAYMENT_NETWORK_DISCLAIMER,
  hiringReadinessFor,
} from "../../../src/ui/trust-labels.ts";

export const dynamic = "force-dynamic";

type Params = Promise<{ agentIdentityKey: string }>;

export default async function AgentProfilePage({
  params,
}: {
  readonly params: Params;
}) {
  const { agentIdentityKey: raw } = await params;
  const agentIdentityKey = decodeURIComponent(raw);
  if (!isSafeAgentIdentityKey(agentIdentityKey)) {
    notFound();
  }
  const agent = getAgentByIdentityKey(agentIdentityKey);
  if (agent == null) {
    notFound();
  }

  const curated = agent.capabilities.filter((c) => c.quality.qualifiesCurated);
  const incomplete = agent.capabilities.filter((c) => c.quality.incomplete);
  const documented = agent.capabilities.filter(
    (c) =>
      c.quality.publicReadiness === "Documented" ||
      c.quality.publicReadiness === "Endpoint observed",
  );

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>{agent.displayName}</h1>
        <p className="lede">{agent.originLabel}</p>
        <div className="facts-row">
          <span className="chip">{agent.registrationNetwork.shortLabel}</span>
          <span className="chip">
            {agent.registered ? "ERC-8004 registered" : "Not registered here"}
          </span>
          <span className="chip">
            {agent.curatedCapabilityCount} curated / {agent.totalCapabilityCount}{" "}
            advertised
          </span>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>Overview</h2>
          <dl>
            <dt>Display name</dt>
            <dd>{agent.displayName}</dd>
            <dt>Operator / provider</dt>
            <dd>
              {agent.operatorKnown
                ? agent.agent.providerId ?? "Provider id present in evidence"
                : "Not evidenced on this profile"}
            </dd>
            <dt>Origin</dt>
            <dd>{agent.originLabel}</dd>
            <dt>Categories touched</dt>
            <dd>
              {agent.categories.length === 0
                ? "None classified"
                : agent.categories
                    .map((id) => getCategoryDefinition(id).name)
                    .join(", ")}
            </dd>
          </dl>
          {agent.linkageWarnings.map((w) => (
            <div key={w} className="callout danger" role="note">
              {w}
            </div>
          ))}
        </section>

        <aside className="panel">
          <h2>Identity &amp; registration</h2>
          <dl>
            <dt>Agent identity key</dt>
            <dd className="mono">{agent.agentIdentityKey}</dd>
            <dt>Canonical registration</dt>
            <dd className="mono">
              {agent.canonicalRegistrationKey ?? "Not registered on this row"}
            </dd>
            <dt>Registration network</dt>
            <dd>{agent.registrationNetwork.label}</dd>
            <dt>registryChainId</dt>
            <dd>{agent.agent.registryChainId ?? "—"}</dd>
            <dt>registryAddress</dt>
            <dd className="mono">{agent.agent.registryAddress ?? "—"}</dd>
            <dt>agentId</dt>
            <dd>{agent.agent.agentId ?? "—"}</dd>
          </dl>
          <p className="mono" role="note">
            {PAYMENT_NETWORK_DISCLAIMER}
          </p>
          <p className="mono">{agent.registrationNetwork.note}</p>
        </aside>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Capabilities</h2>
        <p>
          Curated listings first. Incomplete advertised claims remain available
          below — they are not deleted and are not hire-ready.
        </p>
        {curated.length === 0 ? (
          <div className="empty" role="status">
            No curated capabilities for this agent. See incomplete listings
            below or switch Discover listing scope to All advertised.
          </div>
        ) : (
          <ul className="agent-cap-list">
            {curated.map((cap) => {
              const readiness = hiringReadinessFor(cap.record);
              return (
                <li key={cap.record.capabilityId}>
                  <Link
                    href={`/capabilities/${encodeURIComponent(cap.record.capabilityId)}`}
                  >
                    <strong>{cap.quality.publicTitle}</strong>
                  </Link>
                  <span className="mono">
                    {" "}
                    · {cap.quality.publicReadiness} · {readiness}
                  </span>
                  <p>
                    {cap.record.description?.trim() ||
                      "Description absent in local evidence."}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Trust &amp; evidence</h2>
        <dl>
          <dt>Documented / endpoint-observed capabilities</dt>
          <dd>{documented.length}</dd>
          <dt>Offline demo suitable</dt>
          <dd>{agent.hasOfflineDemo ? "Yes — SEC Identity simulation" : "No"}</dd>
          <dt>Payment verified</dt>
          <dd>0 (none in offline catalog)</dd>
          <dt>Executed and verified</dt>
          <dd>0 (none in offline catalog)</dd>
        </dl>
        <div className="callout" role="note">
          Evidence levels are honest L0 views from local artifacts. Live hire,
          payment, and remote execution remain blocked.
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Technical details</h2>
        <details>
          <summary>Source paths &amp; incomplete listings</summary>
          <dl>
            <dt>sourcePaths</dt>
            <dd className="mono">
              {agent.agent.sourcePaths.join(", ") || "—"}
            </dd>
          </dl>
          {incomplete.length === 0 ? (
            <p>No incomplete capability rows for this agent.</p>
          ) : (
            <ul className="agent-cap-list">
              {incomplete.slice(0, 40).map((cap) => (
                <li key={cap.record.capabilityId}>
                  <Link
                    href={`/capabilities/${encodeURIComponent(cap.record.capabilityId)}`}
                  >
                    {cap.quality.publicTitle}
                  </Link>
                  <span className="mono">
                    {" "}
                    · incomplete · {cap.quality.reasons.join("; ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {incomplete.length > 40 ? (
            <p className="mono">
              Showing 40 of {incomplete.length} incomplete listings.
            </p>
          ) : null}
        </details>
      </section>

      <p style={{ marginTop: "1rem" }}>
        <Link href="/agents">← All agents</Link>
        {" · "}
        <Link href="/">Discover</Link>
      </p>
    </>
  );
}
