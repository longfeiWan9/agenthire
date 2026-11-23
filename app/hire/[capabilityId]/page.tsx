import Link from "next/link";
import { notFound } from "next/navigation";
import { HireConsole } from "../../../components/HireConsole.tsx";
import {
  getCapabilityById,
  isSafeCapabilityId,
} from "../../../src/ui/catalog-store.ts";
import { getOrCreateHireSession } from "../../../src/ui/hire-session.ts";

export const dynamic = "force-dynamic";

type Params = Promise<{ capabilityId: string }>;

export default async function HirePage({
  params,
}: {
  readonly params: Params;
}) {
  const { capabilityId: raw } = await params;
  const capabilityId = decodeURIComponent(raw);
  if (!isSafeCapabilityId(capabilityId)) {
    notFound();
  }
  const loaded = getCapabilityById(capabilityId);
  if (loaded == null) {
    notFound();
  }
  const record = loaded;

  const initial = getOrCreateHireSession(capabilityId);

  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Hire console</h1>
        <p className="lede">
          Offline vertical slice for {record.displayName}. No provider network,
          signing, or payment.
        </p>
        <p>
          <Link href={`/capabilities/${encodeURIComponent(capabilityId)}`}>
            ← Back to capability
          </Link>
        </p>
      </section>
      <HireConsole
        capabilityId={capabilityId}
        displayName={record.displayName}
        initial={initial}
      />
    </>
  );
}
