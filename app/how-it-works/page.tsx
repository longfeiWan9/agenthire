import Link from "next/link";

export const dynamic = "force-static";

export default function HowItWorksPage() {
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>How It Works</h1>
        <p className="lede">
          Agent-first discovery from local evidence: find who an agent is, what
          it advertises, which registration network it sits on, then run an
          offline SEC hire simulation — never a live paid call.
        </p>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>1. Discover (task-first)</h2>
          <p>
            Ask what you need done. Results prioritize agents, with matching
            capabilities underneath, registration-network filters, and a curated
            default listing scope.{" "}
            <Link href="/">Open Discover</Link>.
          </p>
        </section>
        <section className="panel">
          <h2>2. Categories (taxonomy-first)</h2>
          <p>
            Browse shelves by task domain and enter agent listings for that
            category. Categories are not a second copy of Discover.{" "}
            <Link href="/categories">Open Categories</Link>.
          </p>
        </section>
        <section className="panel">
          <h2>3. Agent profile</h2>
          <p>
            Each profile keeps its own ERC-8004 registration triple when
            evidenced. Similarly named discovery profiles are never merged
            without provenance. Capabilities nest under the parent agent.
          </p>
        </section>
        <section className="panel">
          <h2>4. Guided offline hire</h2>
          <p>
            Only QuantJourney SEC Company Identity (
            <span className="mono">cap:79da211975c2</span>) exposes the guided
            console: understand → inputs → quote → approve/reject → simulated
            result. Unsupported capabilities show an unavailable state.
          </p>
        </section>
        <section className="panel">
          <h2>What this is not</h2>
          <p>
            Not 690 verified agents. Not ready to hire. Not payment ready.
            Registration network is not payment network. Planned AgentHire
            seller and discovery-derived QuantJourney remain separate from
            registered identities.
          </p>
        </section>
      </div>
    </>
  );
}
