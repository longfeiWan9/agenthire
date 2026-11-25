import { MARKETPLACE_CATEGORIES } from "../src/marketplace/categories.ts";
import { REGISTRATION_NETWORKS } from "../src/marketplace/agent-identity.ts";
import type { MarketplaceCategoryId } from "../src/marketplace/types.ts";
import type { RegistrationNetworkFilter } from "../src/marketplace/agent-identity.ts";
import type { ListingScope } from "../src/marketplace/listing-policy.ts";

export function DiscoverFilters(props: {
  readonly q?: string;
  readonly category?: MarketplaceCategoryId | "";
  readonly network?: RegistrationNetworkFilter;
  readonly listing?: ListingScope;
  readonly action?: string;
  readonly prompt?: string;
}) {
  const action = props.action ?? "/";
  return (
    <form className="search-panel" action={action} method="get" role="search">
      <label htmlFor="q">
        <strong>{props.prompt ?? "What do you need an agent to do?"}</strong>
      </label>
      <div className="search-row">
        <input
          id="q"
          name="q"
          type="search"
          placeholder='Try "Validate JSON", "Find company SEC identity", "Analyze wallet activity"'
          defaultValue={props.q ?? ""}
          aria-label="Task search"
        />
        <button type="submit">Search</button>
      </div>

      <div className="filter-grid">
        <label htmlFor="network">
          Registration network
          <select
            id="network"
            name="network"
            defaultValue={props.network ?? "all"}
            aria-label="Filter by registration network"
          >
            <option value="all">All registration networks</option>
            {REGISTRATION_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>

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

        <label htmlFor="listing">
          Listing scope
          <select
            id="listing"
            name="listing"
            defaultValue={props.listing ?? "curated"}
            aria-label="Curated or exploratory listings"
          >
            <option value="curated">Curated (default)</option>
            <option value="incomplete">Incomplete / unverified claims</option>
            <option value="all">All advertised</option>
          </select>
        </label>
      </div>
      <p className="mono filter-note">
        Registration network ≠ payment network. Curated listings require a
        readable title, description, category, parent identity, and provenance.
      </p>
    </form>
  );
}
