import Link from "next/link";
import type { CapabilityRecord } from "../src/marketplace/types.ts";
import { getCategoryDefinition } from "../src/marketplace/categories.ts";
import { assessListingQuality } from "../src/marketplace/listing-policy.ts";
import {
  compactCardLabelsFor,
  hiringReadinessFor,
} from "../src/ui/trust-labels.ts";

export function CapabilityCard({
  record,
  matchExplanation,
}: {
  readonly record: CapabilityRecord;
  readonly matchExplanation?: string;
}) {
  const quality = assessListingQuality(record);
  const categoryName = record.categories
    .map((id) => getCategoryDefinition(id).name)
    .join(", ");
  const labels = compactCardLabelsFor(record, categoryName || "Other");
  const readiness = hiringReadinessFor(record);

  return (
    <Link
      href={`/capabilities/${encodeURIComponent(record.capabilityId)}`}
      className="capability-card"
    >
      <h3>{quality.publicTitle}</h3>
      <p>
        {record.description?.trim() ||
          "No description in local evidence — advertised capability only."}
      </p>
      {matchExplanation ? (
        <p className="match-explain">{matchExplanation}</p>
      ) : null}
      <div className="meta-tags" aria-label="Capability labels">
        <span className="tag">{labels.category}</span>
        <span className="tag">{labels.registrationNetwork}</span>
        <span className="tag">{labels.evidence}</span>
        {readiness === "Offline demo available" ? (
          <span className="tag ok">{readiness}</span>
        ) : null}
        {!quality.qualifiesCurated ? (
          <span className="tag warn">Incomplete listing</span>
        ) : null}
      </div>
      <p className="mono">
        Agent: {record.agentDisplayName ?? record.providerKey}
      </p>
    </Link>
  );
}
