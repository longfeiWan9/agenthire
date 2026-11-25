/**
 * D7.1 agent-first marketplace — STRICTLY_OFFLINE.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import {
  canonicalRegistrationKeyOf,
  classifyRegistrationNetwork,
  sameRegisteredIdentity,
} from "../src/marketplace/agent-identity.ts";
import {
  buildAgentDirectory,
  filterAgentDirectory,
  getAgentPresentationByKey,
} from "../src/marketplace/agent-directory.ts";
import {
  assessListingQuality,
  isRawUrlTitle,
} from "../src/marketplace/listing-policy.ts";
import { searchMarketplaceV2 } from "../src/marketplace/search-v2.ts";
import {
  catalogFacts,
  discoverAgentsPage,
  getAgentByIdentityKey,
  getCapabilityById,
  loadMarketplaceCatalog,
  parseDiscoverParams,
  resetCatalogCacheForTests,
} from "../src/ui/catalog-store.ts";

describe("D7.1 agent identity grouping", () => {
  beforeEach(() => {
    resetCatalogCacheForTests();
  });

  it("keeps five distinct agent profiles and never merges QuantJourney by name", () => {
    const catalog = loadMarketplaceCatalog();
    const directory = buildAgentDirectory(catalog);
    expect(directory).toHaveLength(5);

    const qj = directory.filter((a) =>
      a.displayName.toLowerCase().includes("quantjourney"),
    );
    expect(qj).toHaveLength(2);
    expect(sameRegisteredIdentity(qj[0]!.agent, qj[1]!.agent)).toBe(false);
    expect(qj.some((a) => a.registered)).toBe(true);
    expect(qj.some((a) => !a.registered)).toBe(true);
    expect(qj.every((a) => a.linkageWarnings.length > 0)).toBe(true);

    const registered = qj.find((a) => a.registered)!;
    expect(canonicalRegistrationKeyOf(registered.agent)).toBe(
      "eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136",
    );
    expect(classifyRegistrationNetwork(registered.agent).id).toBe(
      "base-sepolia",
    );
  });

  it("groups SEC identity under discovery-derived QuantJourney only", () => {
    const record = getCapabilityById(SEC_IDENTITY_CAPABILITY_ID);
    expect(record).not.toBeNull();
    expect(record!.agentProfileId).toBe("agent:external:1589ec8e8059");
    const agent = getAgentByIdentityKey(record!.agentProfileId);
    expect(agent).not.toBeNull();
    expect(agent!.registered).toBe(false);
    expect(
      agent!.capabilities.some(
        (c) => c.record.capabilityId === SEC_IDENTITY_CAPABILITY_ID,
      ),
    ).toBe(true);

    const sepoliaRegistered = getAgentPresentationByKey(
      loadMarketplaceCatalog(),
      "agent:eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136",
    );
    expect(sepoliaRegistered).not.toBeNull();
    expect(
      sepoliaRegistered!.capabilities.some(
        (c) => c.record.capabilityId === SEC_IDENTITY_CAPABILITY_ID,
      ),
    ).toBe(false);
  });
});

describe("D7.1 network filters and listing policy", () => {
  beforeEach(() => {
    resetCatalogCacheForTests();
  });

  it("filters agent directory by registration network", () => {
    const directory = buildAgentDirectory(loadMarketplaceCatalog());
    const mainnet = filterAgentDirectory(directory, {
      network: "base-mainnet",
      listingScope: "all",
    });
    const sepolia = filterAgentDirectory(directory, {
      network: "base-sepolia",
      listingScope: "all",
    });
    const unknown = filterAgentDirectory(directory, {
      network: "unknown",
      listingScope: "all",
    });

    expect(mainnet.length).toBe(2);
    expect(mainnet.every((a) => a.registrationNetwork.id === "base-mainnet")).toBe(
      true,
    );
    expect(sepolia.length).toBe(1);
    expect(sepolia[0]!.displayName).toMatch(/QuantJourney/);
    expect(unknown.length).toBe(2);
  });

  it("curated scope excludes raw URL titles from default discovery", () => {
    const facts = catalogFacts();
    expect(facts.curatedCapabilityCount).toBeGreaterThan(0);
    expect(facts.curatedCapabilityCount).toBeLessThan(facts.capabilityCount);

    const curated = discoverAgentsPage({
      q: "",
      category: null,
      network: "all",
      listing: "curated",
      page: 1,
    });
    for (const agent of curated.agents) {
      for (const cap of agent.capabilities) {
        expect(cap.quality.qualifiesCurated).toBe(true);
        expect(isRawUrlTitle(cap.quality.publicTitle)).toBe(false);
      }
    }

    const all = discoverAgentsPage({
      q: "",
      category: null,
      network: "all",
      listing: "all",
      page: 1,
    });
    expect(all.agents.length).toBe(5);
  });

  it("assessListingQuality marks URL-only Agent402 rows incomplete", () => {
    const urlCap = getCapabilityById("cap:00afcd5ae140");
    expect(urlCap).not.toBeNull();
    const quality = assessListingQuality(urlCap!);
    expect(quality.qualifiesCurated).toBe(false);
    expect(quality.incomplete).toBe(true);
  });
});

describe("D7.1 search v2", () => {
  beforeEach(() => {
    resetCatalogCacheForTests();
  });

  it("matches SEC / company identity and JSON validation tasks", () => {
    const catalog = loadMarketplaceCatalog();
    const sec = searchMarketplaceV2(catalog, {
      q: "Find company SEC identity",
      listingScope: "all",
    });
    expect(sec.totalCapabilities).toBeGreaterThan(0);
    expect(
      sec.capabilityHits.some(
        (h) => h.capabilityId === SEC_IDENTITY_CAPABILITY_ID,
      ),
    ).toBe(true);
    expect(sec.agentHits[0]?.matchExplanation.length).toBeGreaterThan(0);

    const json = searchMarketplaceV2(catalog, {
      q: "Validate JSON",
      listingScope: "all",
    });
    expect(json.totalCapabilities).toBeGreaterThan(0);
    expect(
      json.capabilityHits.some((h) =>
        /json|schema|validat/i.test(
          `${h.publicTitle} ${h.record.description ?? ""} ${h.matchExplanation}`,
        ),
      ),
    ).toBe(true);

    const wallet = searchMarketplaceV2(catalog, {
      q: "Analyze wallet activity",
      listingScope: "all",
    });
    expect(wallet.totalCapabilities).toBeGreaterThan(0);

    const none = searchMarketplaceV2(catalog, {
      q: "zzznomatchagentHireXYZ",
      listingScope: "all",
    });
    expect(none.totalCapabilities).toBe(0);
    expect(none.lowConfidence).toBe(true);
  });

  it("parseDiscoverParams preserves network and listing filters", () => {
    const parsed = parseDiscoverParams({
      q: " SEC ",
      network: "base-sepolia",
      listing: "incomplete",
      category: "research-intelligence",
      page: "2",
    });
    expect(parsed.q).toBe("SEC");
    expect(parsed.network).toBe("base-sepolia");
    expect(parsed.listing).toBe("incomplete");
    expect(parsed.category).toBe("research-intelligence");
    expect(parsed.page).toBe(2);
  });
});
