import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentCard } from "../../../components/AgentCard.tsx";
import { DiscoverFilters } from "../../../components/DiscoverFilters.tsx";
import {
  buildFilterHref,
  categoryAgentSummary,
  getCategoryDefinition,
  parseCategoryParam,
  parseDiscoverParams,
} from "../../../src/ui/catalog-store.ts";

export const dynamic = "force-dynamic";

type Params = Promise<{ categoryId: string }>;
type SearchParams = Promise<{
  network?: string;
  listing?: string;
  q?: string;
  page?: string;
}>;

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  readonly params: Params;
  readonly searchParams: SearchParams;
}) {
  const { categoryId: raw } = await params;
  const parsed = parseCategoryParam(raw);
  if (parsed == null) {
    notFound();
  }
  const categoryId = parsed;
  const sp = await searchParams;
  const filters = parseDiscoverParams({ ...sp, category: categoryId });
  const def = getCategoryDefinition(categoryId);
  const summary = categoryAgentSummary(categoryId, {
    network: filters.network,
    listing: filters.listing,
  });

  // Optional text filter across agents already in category.
  const q = filters.q.toLowerCase();
  const agents = q
    ? summary.agents.filter((a) => {
        const hay = [
          a.displayName,
          a.agentIdentityKey,
          ...a.capabilities.map((c) => c.quality.publicTitle),
          ...a.capabilities.map((c) => c.record.description ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : summary.agents;

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>{def.name}</h1>
        <p className="lede">{def.description}</p>
        <div className="facts-row">
          <span className="chip">{agents.length} agents in view</span>
          <span className="chip">
            {summary.curatedCapabilityCount} curated capabilities
          </span>
          <span className="chip">
            {summary.totalCapabilityCount} advertised in category
          </span>
        </div>
      </section>

      <DiscoverFilters
        q={filters.q}
        category={categoryId}
        network={filters.network}
        listing={filters.listing}
        action={`/categories/${encodeURIComponent(categoryId)}`}
        prompt={`Find agents in ${def.name}`}
      />

      <div className="results-meta">
        <span>
          Agent-first category listing · registration filters apply
        </span>
        <Link href="/categories">← All categories</Link>
      </div>

      {agents.length === 0 ? (
        <div className="empty" role="status">
          No agents with listings in this category for the selected scope. Try{" "}
          <a
            href={buildFilterHref(`/categories/${encodeURIComponent(categoryId)}`, {
              listing: "all",
              network: filters.network,
            })}
          >
            All advertised
          </a>
          .
        </div>
      ) : (
        <div className="agent-list">
          {agents.map((agent) => (
            <AgentCard key={agent.agentIdentityKey} agent={agent} />
          ))}
        </div>
      )}
    </>
  );
}
