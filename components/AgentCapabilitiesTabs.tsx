"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { HiringReadinessLabel } from "../src/ui/trust-labels.ts";

export type AgentCapabilityListItem = {
  readonly capabilityId: string;
  readonly publicTitle: string;
  readonly publicReadiness: string;
  readonly readiness: HiringReadinessLabel;
  readonly description: string;
  readonly incomplete: boolean;
};

type TabId = "hire-ready" | "not-hire-ready";

export function AgentCapabilitiesTabs(props: {
  readonly hireReady: readonly AgentCapabilityListItem[];
  readonly notHireReady: readonly AgentCapabilityListItem[];
}) {
  const baseId = useId();
  const defaultTab: TabId =
    props.hireReady.length > 0 ? "hire-ready" : "not-hire-ready";
  const [tab, setTab] = useState<TabId>(defaultTab);

  const hireTabId = `${baseId}-tab-hire`;
  const notTabId = `${baseId}-tab-not`;
  const hirePanelId = `${baseId}-panel-hire`;
  const notPanelId = `${baseId}-panel-not`;

  return (
    <div className="cap-tabs">
      <p className="mono filter-note" role="note">
        “Hire-ready” here means an offline demo path is available — not live
        provider execution or payment.
      </p>
      <div className="cap-tablist" role="tablist" aria-label="Capability readiness">
        <button
          type="button"
          role="tab"
          id={hireTabId}
          aria-selected={tab === "hire-ready"}
          aria-controls={hirePanelId}
          tabIndex={tab === "hire-ready" ? 0 : -1}
          className={tab === "hire-ready" ? "cap-tab active" : "cap-tab"}
          onClick={() => setTab("hire-ready")}
        >
          Hire-ready
          <span className="cap-tab-count">{props.hireReady.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id={notTabId}
          aria-selected={tab === "not-hire-ready"}
          aria-controls={notPanelId}
          tabIndex={tab === "not-hire-ready" ? 0 : -1}
          className={tab === "not-hire-ready" ? "cap-tab active" : "cap-tab"}
          onClick={() => setTab("not-hire-ready")}
        >
          Not hire-ready
          <span className="cap-tab-count">{props.notHireReady.length}</span>
        </button>
      </div>

      <div
        role="tabpanel"
        id={hirePanelId}
        aria-labelledby={hireTabId}
        hidden={tab !== "hire-ready"}
      >
        {props.hireReady.length === 0 ? (
          <div className="empty" role="status">
            No offline hire-ready capabilities for this agent. Live hire remains
            blocked across the catalog.
          </div>
        ) : (
          <CapabilityList items={props.hireReady} />
        )}
      </div>

      <div
        role="tabpanel"
        id={notPanelId}
        aria-labelledby={notTabId}
        hidden={tab !== "not-hire-ready"}
      >
        {props.notHireReady.length === 0 ? (
          <div className="empty" role="status">
            No non-hireable curated capabilities on this profile.
          </div>
        ) : (
          <CapabilityList items={props.notHireReady} />
        )}
      </div>
    </div>
  );
}

function CapabilityList(props: {
  readonly items: readonly AgentCapabilityListItem[];
}) {
  return (
    <ul className="agent-cap-list">
      {props.items.map((cap) => (
        <li key={cap.capabilityId}>
          <Link href={`/capabilities/${encodeURIComponent(cap.capabilityId)}`}>
            <strong>{cap.publicTitle}</strong>
          </Link>
          <span className="mono">
            {" "}
            · {cap.publicReadiness} · {cap.readiness}
            {cap.incomplete ? " · incomplete" : ""}
          </span>
          <p>
            {cap.description ||
              "Description absent in local evidence."}
          </p>
        </li>
      ))}
    </ul>
  );
}
