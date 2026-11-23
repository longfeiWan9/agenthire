import Link from "next/link";
import { notFound } from "next/navigation";
import { SEC_IDENTITY_CAPABILITY_ID } from "../../../src/adapters/quantjourney-sec-identity.ts";
import { getCategoryDefinition } from "../../../src/marketplace/categories.ts";
import {
  getCapabilityById,
  isSafeCapabilityId,
} from "../../../src/ui/catalog-store.ts";
import { buildProvenanceView } from "../../../src/ui/provenance.ts";
import {
  evidenceLevelFor,
  hiringReadinessFor,
  interfaceFieldLabel,
  ladderLevelFor,
  ladderNotes,
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

  const provenance = buildProvenanceView(record);
  const evidence = evidenceLevelFor(record);
  const readiness = hiringReadinessFor(record);
  const payment = paymentLabelFor(record);
  const ladder = ladderLevelFor(record);
  const isSec = record.capabilityId === SEC_IDENTITY_CAPABILITY_ID;

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>{record.displayName}</h1>
        <p className="lede">
          {record.description?.trim() ||
            "Advertised capability from local evidence — description absent."}
        </p>
        <div className="facts-row">
          <span className="chip">{evidence}</span>
          <span className="chip">{readiness}</span>
          <span className="chip">{payment}</span>
          <span className="chip">Ladder {ladder}</span>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel">
          <h2>Overview</h2>
          <dl>
            <dt>capabilityId</dt>
            <dd>{record.capabilityId}</dd>
            <dt>provider</dt>
            <dd>{record.agentDisplayName ?? record.providerKey}</dd>
            <dt>serviceKey</dt>
            <dd>{record.serviceKey}</dd>
            <dt>sourceKind</dt>
            <dd>{record.sourceKind}</dd>
            <dt>protocols</dt>
            <dd>{record.protocols.join(", ") || "unknown"}</dd>
            <dt>categories</dt>
            <dd>
              {record.categories
                .map((id) => getCategoryDefinition(id).name)
                .join(", ")}
            </dd>
            <dt>verification milestone</dt>
            <dd>{record.verification.derivedMilestone}</dd>
          </dl>
          <div className="callout" role="note">
            {ladderNotes(record)}
          </div>
        </section>

        <aside className="panel">
          <h2>Identity &amp; provenance</h2>
          <dl>
            <dt>agentProfileId</dt>
            <dd>{provenance.agentProfileId}</dd>
            <dt>provenance</dt>
            <dd>{provenance.provenance}</dd>
            <dt>ERC-8004 registered</dt>
            <dd>{provenance.erc8004.registered ? "observed" : "not on this profile"}</dd>
            <dt>registryChainId</dt>
            <dd>{interfaceFieldLabel(provenance.erc8004.registryChainId?.toString())}</dd>
            <dt>registryAddress</dt>
            <dd>{interfaceFieldLabel(provenance.erc8004.registryAddress)}</dd>
            <dt>agentId</dt>
            <dd>{interfaceFieldLabel(provenance.erc8004.agentId)}</dd>
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
        <h2>Interface (honest Unknowns)</h2>
        <dl>
          <dt>method</dt>
          <dd>{interfaceFieldLabel(record.method)}</dd>
          <dt>endpointUrl</dt>
          <dd>{interfaceFieldLabel(record.endpointUrl)}</dd>
          <dt>requestSchema</dt>
          <dd>Unknown</dd>
          <dt>responseSchema</dt>
          <dd>Unknown</dd>
          <dt>ladder L0–L4</dt>
          <dd>
            L0 current · L1–L4 not reached (D5.4/D5.5 null L1 selection)
          </dd>
        </dl>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Hire</h2>
        {isSec ? (
          <>
            <p>
              Offline SEC Identity demo adapter available. Live hire remains
              blocked — interface undocumented; prior Agent402 OpenAPI
              inspection did not produce an L1 path for QuantJourney.
            </p>
            <Link className="btn" href={`/hire/${encodeURIComponent(record.capabilityId)}`}>
              Try offline demo
            </Link>
          </>
        ) : (
          <>
            <div className="callout danger" role="status">
              Live hire disabled — {readiness}. No offline adapter for this
              capability. No generic executor.
            </div>
            <button type="button" className="btn" disabled>
              Live hire unavailable
            </button>
          </>
        )}
      </section>
    </>
  );
}
