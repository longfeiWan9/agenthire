import Link from "next/link";
import { catalogFacts } from "../../src/ui/catalog-store.ts";

export const dynamic = "force-static";

export default function CategoriesPage() {
  const facts = catalogFacts();
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Categories</h1>
        <p className="lede">
          Four curated categories plus Other. Categories aid discovery; they
          never restrict listing.
        </p>
      </section>
      <div className="category-grid">
        <Link className="category-link" href="/">
          <strong>All</strong>
          <span>{facts.capabilityCount} capabilities</span>
        </Link>
        {facts.summary.categories.map((c) => (
          <Link
            key={c.categoryId}
            className="category-link"
            href={`/categories/${encodeURIComponent(c.categoryId)}`}
          >
            <strong>{c.name}</strong>
            <span>
              {c.capabilityCount} capabilities · {c.agentProfileCount} profiles
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
