/**
 * Legacy capability search form — Discover now uses DiscoverFilters.
 * Kept for compatibility with older pages/tests that post to /.
 */

import { DiscoverFilters } from "./DiscoverFilters.tsx";
import type { MarketplaceCategoryId } from "../src/marketplace/types.ts";

export function SearchForm(props: {
  readonly q?: string;
  readonly category?: MarketplaceCategoryId | "";
  readonly action?: string;
}) {
  return (
    <DiscoverFilters
      q={props.q}
      category={props.category}
      action={props.action}
      prompt="What do you need an agent to do?"
    />
  );
}
