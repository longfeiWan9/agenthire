import Link from "next/link";
import { notFound } from "next/navigation";
import { SEC_IDENTITY_CAPABILITY_ID } from "../../../src/adapters/quantjourney-sec-identity.ts";
import { getCategoryDefinition } from "../../../src/marketplace/categories.ts";
import { assessListingQuality } from "../../../src/marketplace/listing-policy.ts";
import {
  getAgentByIdentityKey,
  getCapabilityById,
  isSafeCapabilityId,
} from "../../../src/ui/catalog-store.ts";
import { buildProvenanceView } from "../../../src/ui/provenance.ts";
import {
  PAYMENT_NETWORK_DISCLAIMER,
  evidenceLevelFor,
  hiringReadinessFor,
  interfaceMissingLabel,
  ladderLevelFor,
  ladderNotes,
  networkLabelFor,
  paymentLabelFor,
} from "../../../src/ui/trust-labels.ts";

export const dynamic = "force-dynamic";

type Params = Promise<{ capabilityId: string }>;

export default async function CapabilityDetailPage({
  params,
}: {
  readonly params: Params;
}) {
  const { capabilityId: raw } = await params;
  const capabilityId = decodeURIComponent(raw);
  if (!isSafeCapabilityId(capabilityId)) {
    notFound();
  }
  const loaded = getCapabilityById(capabilityId);
  if (loaded == null) {
    notFound();
  }
  const record = loaded;
  const quality = assessListingQuality(record);
  const agent = getAgentByIdentityKey(record.agentProfileId);
  const provenance = buildProvenanceView(record);
  const evidence = evidenceLevelFor(record);
  const readiness = hiringReadinessFor(record);
  const payment = paymentLabelFor(record);
  const network = networkLabelFor(record);
  const ladder = ladderLevelFor(record);
  const isSec = record.capabilityId === SEC_IDENTITY_CAPABILITY_ID;

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>{quality.publicTitle}</h1>
        <p className="lede">
          {record.description?.trim() ||
            "Advertised capability from local evidence — description absent."}
        </p>
        <div className="facts-row">
          <span className="chip">{evidence}</span>
          <span className="chip">{network}</span>
          <span className="chip">{quality.publicReadiness}</span>
          <span className="chip">{readiness}</span>
          <span className="chip">Ladder {ladder}</span>
          {!quality.qualifiesCurated ? (
            <span className="chip">Incomplete listing</span>
          ) : null}
        </div>
        {agent ? (
          <p>
            Parent agent:{" "}
            <Link href={`/agents/${encodeURIComponent(agent.agentIdentityKey)}`}>
              {agent.displayName}
            </Link>
          </p>
        ) : (
          <p className="mono">Parent agent profile missing from catalog.</p>
        )}
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>Overview</h2>
          <dl>
            <dt>Capability ID</dt>
            <dd>{record.capabilityId}</dd>
            <dt>Public title</dt>
            <dd>
              {quality.publicTitle}
              {quality.titleNormalized ? " (normalized from evidence)" : ""}
            </dd>
            <dt>Raw catalog title</dt>
            <dd className="mono">{record.displayName}</dd>
            <dt>Registration network</dt>
            <dd>{network}</dd>
            <dt>Categories</dt>
            <dd>
              {record.categories
                .map((id) => getCategoryDefinition(id).name)
                .join(", ")}
            </dd>
            <dt>Public readiness</dt>
            <dd>{quality.publicReadiness}</dd>
            <dt>Payment label</dt>
            <dd>{payment}</dd>
          </dl>
          <div className="callout" role="note">
            {ladderNotes(record)}
          </div>
          <p className="mono" role="note">
            {PAYMENT_NETWORK_DISCLAIMER}
          </p>
        </section>

        <aside className="panel">
          <h2>Identity &amp; provenance</h2>
          <dl>
            <dt>agentProfileId</dt>
            <dd>
              <Link
                href={`/agents/${encodeURIComponent(provenance.agentProfileId)}`}
              >
                {provenance.agentProfileId}
              </Link>
            </dd>
            <dt>provenance</dt>
            <dd>{provenance.provenance}</dd>
            <dt>ERC-8004 registered</dt>
            <dd>
              {provenance.erc8004.registered
                ? "observed"
                : "not on this profile"}
            </dd>
            <dt>registryChainId</dt>
            <dd>
              {interfaceMissingLabel(
                provenance.erc8004.registryChainId?.toString(),
              )}
            </dd>
            <dt>registryAddress</dt>
            <dd>
              {interfaceMissingLabel(provenance.erc8004.registryAddress)}
            </dd>
            <dt>agentId</dt>
            <dd>{interfaceMissingLabel(provenance.erc8004.agentId)}</dd>
          </dl>
          {provenance.discoveryWarnings.map((w) => (
            <div key={w} className="callout">
              {w}
            </div>
          ))}
          {provenance.quantJourneyAmbiguity ? (
            <div className="callout danger">{provenance.quantJourneyAmbiguity}</div>
          ) : null}
          {provenance.identityLinkageNote ? (
            <p className="mono">{provenance.identityLinkageNote}</p>
          ) : null}
          {provenance.plannedSellerNote ? (
            <div className="callout">{provenance.plannedSellerNote}</div>
          ) : null}
        </aside>
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Interface</h2>
        <dl>
          <dt>method</dt>
          <dd>{interfaceMissingLabel(record.method)}</dd>
          <dt>endpointUrl</dt>
          <dd>{interfaceMissingLabel(record.endpointUrl)}</dd>
          <dt>requestSchema</dt>
          <dd>Not inspected yet</dd>
          <dt>responseSchema</dt>
          <dd>Not inspected yet</dd>
          <dt>ladder L0–L4</dt>
          <dd>
            L0 current · L1–L4 not reached (D5.4/D5.5 null L1 selection)
          </dd>
        </dl>
        <details>
          <summary>Technical catalog fields</summary>
          <dl>
            <dt>serviceKey</dt>
            <dd className="mono">{record.serviceKey}</dd>
            <dt>sourceKind</dt>
            <dd className="mono">{record.sourceKind}</dd>
            <dt>protocols</dt>
            <dd className="mono">{record.protocols.join(", ") || "unknown"}</dd>
            <dt>verification milestone</dt>
            <dd className="mono">{record.verification.derivedMilestone}</dd>
          </dl>
        </details>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Hire</h2>
        {isSec ? (
          <>
            <p>
              Guided offline SEC Identity demo available. Live hire remains
              blocked — interface undocumented; prior inspections did not
              produce an L1 path for QuantJourney.
            </p>
            <Link
              className="btn"
              href={`/hire/${encodeURIComponent(record.capabilityId)}`}
            >
              Start guided offline hire
            </Link>
          </>
        ) : (
          <>
            <div className="callout danger" role="status">
              Hire unavailable — {readiness}. No offline adapter for this
              capability. No generic executor. An L1/L2 evidence label alone
              does not unlock live hire.
            </div>
            <button
              type="button"
              className="btn"
              disabled
              aria-disabled="true"
              title="Live hire disabled for this capability"
            >
              Live hire unavailable
            </button>
          </>
        )}
      </section>
    </>
  );
}
