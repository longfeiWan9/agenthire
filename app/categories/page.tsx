import Link from "next/link";
import {
  catalogFacts,
  categoryAgentSummary,
} from "../../src/ui/catalog-store.ts";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  const facts = catalogFacts();
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Categories</h1>
        <p className="lede">
          Taxonomy-first browsing. Pick a task domain to see which agents
          advertise capabilities there. Discover remains the task-search entry;
          Categories is the shelf index — not a duplicate results page.
        </p>
      </section>

      <div className="category-grid">
        {facts.categories.map((c) => {
          const summary = categoryAgentSummary(c.id, { listing: "curated" });
          return (
            <Link
              key={c.id}
              className="category-link"
              href={`/categories/${encodeURIComponent(c.id)}`}
            >
              <strong>{c.name}</strong>
              <span>{c.description}</span>
              <span className="mono">
                {summary.agentCount} agents with curated listings ·{" "}
                {summary.curatedCapabilityCount} curated caps ·{" "}
                {summary.totalCapabilityCount} advertised total
              </span>
            </Link>
          );
        })}
      </div>

      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>How counts work</h2>
        <p>
          Agent counts include distinct agent profiles that have at least one
          capability in the category under the current listing scope (default:
          curated). Advertised totals still reflect the full local catalog —
          volume is not hire-readiness.
        </p>
        <p>
          Prefer task search? Go to <Link href="/">Discover</Link>. Prefer
          identity browsing? Open <Link href="/agents">Agents</Link>.
        </p>
      </section>
    </>
  );
}
