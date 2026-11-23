import { notFound } from "next/navigation";
import { CapabilityCard } from "../../../components/CapabilityCard.tsx";
import { Pagination } from "../../../components/Pagination.tsx";
import {
  getCategoryDefinition,
  listCategoryPage,
  parseCategoryParam,
} from "../../../src/ui/catalog-store.ts";

export const dynamic = "force-dynamic";

type Params = Promise<{ categoryId: string }>;
type SearchParams = Promise<{ page?: string }>;

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
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const def = getCategoryDefinition(categoryId);
  const paged = listCategoryPage(categoryId, page, 24);

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>{def.name}</h1>
        <p className="lede">{def.description}</p>
      </section>
      <div className="results-meta">
        <span>
          {paged.result.total} capabilities · page {paged.page}/
          {paged.totalPages}
        </span>
      </div>
      {paged.pageHits.length === 0 ? (
        <div className="empty">No capabilities in this category.</div>
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
        hrefForPage={(p) =>
          p > 1
            ? `/categories/${encodeURIComponent(categoryId)}?page=${p}`
            : `/categories/${encodeURIComponent(categoryId)}`
        }
      />
    </>
  );
}
