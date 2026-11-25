import { AgentCard } from "../../components/AgentCard.tsx";
import { DiscoverFilters } from "../../components/DiscoverFilters.tsx";
import { Pagination } from "../../components/Pagination.tsx";
import {
  buildFilterHref,
  catalogFacts,
  discoverAgentsPage,
  parseDiscoverParams,
} from "../../src/ui/catalog-store.ts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  network?: string;
  listing?: string;
  page?: string;
}>;

export default async function AgentsDirectoryPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const params = parseDiscoverParams(sp);
  const facts = catalogFacts();
  const paged = discoverAgentsPage(params, 12);

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Agents</h1>
        <p className="lede">
          Directory of {facts.agentProfileCount} agent profiles from local
          evidence. Each profile keeps its own registration identity —
          similarly named agents are never merged without provenance.
        </p>
      </section>

      <DiscoverFilters
        q={params.q}
        category={params.category ?? ""}
        network={params.network}
        listing={params.listing}
        action="/agents"
        prompt="Filter the agent directory"
      />

      <div className="results-meta">
        <span>
          {paged.agents.length} agents · page {paged.page}/{paged.totalPages}
        </span>
      </div>

      {paged.pageAgents.length === 0 ? (
        <div className="empty" role="status">
          No agents in this filter scope.
        </div>
      ) : (
        <div className="agent-list">
          {paged.pageAgents.map((agent) => (
            <AgentCard
              key={agent.agentIdentityKey}
              agent={agent}
              showCapabilities={false}
            />
          ))}
        </div>
      )}

      <Pagination
        page={paged.page}
        totalPages={paged.totalPages}
        hrefForPage={(p) =>
          buildFilterHref("/agents", {
            q: params.q,
            category: params.category ?? undefined,
            network: params.network,
            listing: params.listing,
            page: p,
          })
        }
      />
    </>
  );
}
