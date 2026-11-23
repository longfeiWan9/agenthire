import { CapabilityCard } from "../components/CapabilityCard.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { SearchForm } from "../components/SearchForm.tsx";
import {
  catalogFacts,
  parseSearchParams,
  searchCatalogPage,
} from "../src/ui/catalog-store.ts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  category?: string;
  page?: string;
}>;

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { query, page, q } = parseSearchParams(sp);
  const facts = catalogFacts();
  const paged = searchCatalogPage(query, page, 24);
  const category = typeof query.category === "string" ? query.category : "";

  const hrefForPage = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <>
      <section className="hero" aria-label="Hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Discover. Hire. Pay AI Agents.</h1>
        <p className="lede">
          Explore {facts.capabilityCount} advertised capabilities across{" "}
          {facts.agentProfileCount} agent profiles from local evidence. Hiring
          stays offline-demo only — not verified live execution.
        </p>
        <div className="facts-row" aria-label="Catalog facts">
          <span className="chip">{facts.capabilityCount} capabilities</span>
          <span className="chip">{facts.agentProfileCount} agent profiles</span>
          <span className="chip">
            {facts.erc8004IdentityCount} ERC-8004 identities
          </span>
          <span className="chip">4 curated categories + Other</span>
        </div>
      </section>

      <SearchForm q={q} category={category || ""} />

      <div className="category-grid" aria-label="Categories">
        <a className="category-link" href="/">
          <strong>All</strong>
          <span>{facts.capabilityCount} capabilities</span>
        </a>
        {facts.summary.categories.map((c) => (
          <a
            key={c.categoryId}
            className="category-link"
            href={`/?category=${encodeURIComponent(c.categoryId)}`}
          >
            <strong>{c.name}</strong>
            <span>{c.capabilityCount} capabilities</span>
          </a>
        ))}
      </div>

      <div className="results-meta">
        <span>
          {paged.result.total === 0
            ? "No capabilities matched"
            : `Showing ${paged.pageHits.length} of ${paged.result.total} · page ${paged.page}/${paged.totalPages}`}
        </span>
        <span className="mono">Search ranks discoverability, not readiness</span>
      </div>

      {paged.pageHits.length === 0 ? (
        <div className="empty" role="status">
          No results for this query. Try another keyword or browse categories.
        </div>
      ) : (
        <div className="card-list">
          {paged.pageHits.map((hit) => (
            <CapabilityCard key={hit.capabilityId} record={hit.record} />
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
