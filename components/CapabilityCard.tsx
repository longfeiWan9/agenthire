import Link from "next/link";
import type { CapabilityRecord } from "../src/marketplace/types.ts";
import { getCategoryDefinition } from "../src/marketplace/categories.ts";
import {
  evidenceLevelFor,
  hiringReadinessFor,
  networkLabelFor,
  paymentLabelFor,
} from "../src/ui/trust-labels.ts";

export function CapabilityCard({ record }: { readonly record: CapabilityRecord }) {
  const evidence = evidenceLevelFor(record);
  const readiness = hiringReadinessFor(record);
  const payment = paymentLabelFor(record);
  const network = networkLabelFor(record);
  const categories = record.categories
    .map((id) => getCategoryDefinition(id).name)
    .join(", ");

  return (
    <Link
      href={`/capabilities/${encodeURIComponent(record.capabilityId)}`}
      className="capability-card"
    >
      <h3>{record.displayName}</h3>
      <p>
        {record.description?.trim() ||
          "No description in local evidence — advertised capability only."}
      </p>
      <div className="meta-tags">
        <span className="tag">{record.agentDisplayName ?? record.providerKey}</span>
        <span className="tag">{network}</span>
        <span className="tag">{categories || "Other"}</span>
        <span className="tag">{evidence}</span>
        <span
          className={
            readiness === "Offline demo available" ? "tag ok" : "tag warn"
          }
        >
          {readiness}
        </span>
        <span className="tag danger">{payment}</span>
      </div>
    </Link>
  );
}
