import { AgentCard } from "../components/AgentCard.tsx";
import { DiscoverFilters } from "../components/DiscoverFilters.tsx";
import { Pagination } from "../components/Pagination.tsx";
import {
  buildFilterHref,
  catalogFacts,
  discoverAgentsPage,
  parseDiscoverParams,
} from "../src/ui/catalog-store.ts";
import { PAYMENT_NETWORK_DISCLAIMER } from "../src/ui/trust-labels.ts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  network?: string;
  listing?: string;
  page?: string;
}>;

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const params = parseDiscoverParams(sp);
  const facts = catalogFacts();
  const paged = discoverAgentsPage(params, 12);

  const hrefForPage = (p: number) =>
    buildFilterHref("/", {
      q: params.q,
      category: params.category ?? undefined,
      network: params.network,
      listing: params.listing,
      page: p,
    });

  const matchByAgent = new Map(
    paged.search.agentHits.map((h) => [h.agentProfileId, h.matchExplanation]),
  );

  return (
    <>
      <section className="hero" aria-label="Hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Discover. Hire. Pay AI Agents.</h1>
        <p className="lede">
          Task-first discovery over {facts.agentProfileCount} agent profiles and{" "}
          {facts.capabilityCount} advertised capabilities from local evidence.
          Default view shows curated services — not {facts.capabilityCount}{" "}
          hire-ready agents.
        </p>
        <div className="facts-row" aria-label="Catalog facts">
          <span className="chip">{facts.agentProfileCount} agent profiles</span>
          <span className="chip">
            {facts.curatedCapabilityCount} curated capabilities
          </span>
          <span className="chip">
            {facts.capabilityCount} advertised (exploratory)
          </span>
          <span className="chip">
            {facts.erc8004IdentityCount} ERC-8004 identities
          </span>
        </div>
      </section>

      <DiscoverFilters
        q={params.q}
        category={params.category ?? ""}
        network={params.network}
        listing={params.listing}
      />

      <p className="mono filter-note" role="note">
        {PAYMENT_NETWORK_DISCLAIMER}
      </p>

      <div className="results-meta">
        <span>
          {paged.agents.length === 0
            ? "No agents matched"
            : `Showing ${paged.pageAgents.length} of ${paged.agents.length} agents · page ${paged.page}/${paged.totalPages}`}
        </span>
        <span className="mono">
          {params.q
            ? paged.search.lowConfidence
              ? "Low-confidence deterministic match"
              : "Search ranks discoverability, not readiness"
            : "Browse curated agents by registration network"}
        </span>
      </div>

      {paged.pageAgents.length === 0 ? (
        <div className="empty" role="status">
          <p>
            No agents matched this task and filter combination. Try another
            phrase, switch listing scope to{" "}
            <a
              href={buildFilterHref("/", {
                q: params.q,
                category: params.category ?? undefined,
                network: params.network,
                listing: "all",
                page: 1,
              })}
            >
              All advertised
            </a>
            , or browse{" "}
            <a href="/categories">Categories</a>.
          </p>
          <p className="mono">
            Example queries: Validate JSON · Find company SEC identity · Analyze
            wallet activity · Research an organization
          </p>
        </div>
      ) : (
        <div className="agent-list">
          {paged.pageAgents.map((agent) => (
            <AgentCard
              key={agent.agentIdentityKey}
              agent={agent}
              matchExplanation={matchByAgent.get(agent.agentIdentityKey)}
            />
          ))}
        </div>
      )}

      <Pagination
        page={paged.page}
        totalPages={paged.totalPages}
        hrefForPage={hrefForPage}
      />
    </>
  );
}
