import Link from "next/link";

export function Pagination(props: {
  readonly page: number;
  readonly totalPages: number;
  readonly hrefForPage: (page: number) => string;
}) {
  const { page, totalPages, hrefForPage } = props;
  if (totalPages <= 1) return null;

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);

  return (
    <nav className="pagination" aria-label="Results pages">
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)}>Previous</Link>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      {windowStart > 1 ? (
        <>
          <Link href={hrefForPage(1)}>1</Link>
          {windowStart > 2 ? <span>…</span> : null}
        </>
      ) : null}
      {pages.map((p) =>
        p === page ? (
          <span key={p} className="current" aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={hrefForPage(p)}>
            {p}
          </Link>
        ),
      )}
      {windowEnd < totalPages ? (
        <>
          {windowEnd < totalPages - 1 ? <span>…</span> : null}
          <Link href={hrefForPage(totalPages)}>{totalPages}</Link>
        </>
      ) : null}
      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)}>Next</Link>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}
