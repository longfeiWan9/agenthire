export const dynamic = "force-static";

export default function HowItWorksPage() {
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>How It Works</h1>
        <p className="lede">
          Discover capabilities from local evidence, inspect honest provenance,
          then run an offline SEC hire simulation — never a live paid call.
        </p>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>1. Discover</h2>
          <p>
            Search and browse 690 advertised capabilities across 5 agent
            profiles and 3 ERC-8004 identities. Categories aid discovery; Other
            remains listable.
          </p>
        </section>
        <section className="panel">
          <h2>2. Inspect</h2>
          <p>
            Detail pages show evidence level, ladder L0, Unknown interface
            fields when undocumented, and payment labels that never treat
            unknown as Free.
          </p>
        </section>
        <section className="panel">
          <h2>3. Offline hire demo</h2>
          <p>
            Only QuantJourney SEC Company Identity (
            <span className="mono">cap:79da211975c2</span>) exposes the offline
            hire console: validate input, create HireJob, show live-quote
            unavailable, reveal a labeled synthetic quote, simulation
            approve/reject, and run named fixtures with the mandatory banner.
          </p>
        </section>
        <section className="panel">
          <h2>What this is not</h2>
          <p>
            Not 690 verified agents. Not ready to hire. Not payment ready.
            Planned AgentHire seller and discovery-derived QuantJourney profile
            are not independently verified registered agents. OPENAPI-001 is
            consumed; D5.4/D5.5 selected null L1.
          </p>
        </section>
      </div>
    </>
  );
}
