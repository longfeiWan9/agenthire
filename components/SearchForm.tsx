import { MARKETPLACE_CATEGORIES } from "../src/marketplace/categories.ts";
import type { MarketplaceCategoryId } from "../src/marketplace/types.ts";

export function SearchForm(props: {
  readonly q?: string;
  readonly category?: MarketplaceCategoryId | "";
  readonly action?: string;
}) {
  const action = props.action ?? "/";
  return (
    <form className="search-panel" action={action} method="get" role="search">
      <label htmlFor="q">
        <strong>Search the local capability catalog</strong>
      </label>
      <div className="search-row">
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Name, keyword, or phrase"
          defaultValue={props.q ?? ""}
          aria-label="Search capabilities"
        />
        <button type="submit">Search</button>
      </div>
      <label htmlFor="category">
        Category
        <select
          id="category"
          name="category"
          defaultValue={props.category ?? ""}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {MARKETPLACE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
