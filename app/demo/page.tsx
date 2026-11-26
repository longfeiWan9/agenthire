import Link from "next/link";
import { SEC_IDENTITY_CAPABILITY_ID } from "../../src/adapters/quantjourney-sec-identity.ts";
import { VERTICAL_SLICE_SCENARIOS } from "../../src/ui/vertical-slice-scenarios.ts";

export const dynamic = "force-static";

export default function DemoPage() {
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Offline demo</h1>
        <p className="lede">
          Day 8.1 vertical slice — Discover → Evaluate → Hire → Authorize →
          Execute → Verify — on local evidence only. CLI demos remain available
          via <span className="mono">pnpm demo:hirejob:offline</span> and{" "}
          <span className="mono">pnpm demo:hirejob:quote:offline</span>.
        </p>
      </section>

      <section className="panel">
        <h2>Eight offline scenarios</h2>
        <ol className="scenario-list" data-testid="vertical-slice-scenarios">
          {VERTICAL_SLICE_SCENARIOS.map((s, index) => (
            <li key={s.id}>
              <h3>
                {index + 1}. {s.title}
              </h3>
              <p className="mono">
                id={s.id}; phase={s.phase}
              </p>
              <p>
                <Link href={s.route}>Open route</Link>
              </p>
              <ul>
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <p className="mono">
                expect: {s.expectedSignals.join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Suggested happy path</h2>
        <ol>
          <li>
            <Link href="/">Discover</Link> — ask for “Find company SEC identity”
            or filter registration network to Base Sepolia.
          </li>
          <li>
            Open the discovery-derived QuantJourney agent profile (kept separate
            from the ERC-8004 QuantJourney registration).
          </li>
          <li>
            Open{" "}
            <Link
              href={`/capabilities/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`}
            >
              SEC Company Identity
            </Link>
            .
          </li>
          <li>
            Choose{" "}
            <Link href={`/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`}>
              Start guided offline hire
            </Link>
            : understand → validate ticker AAPL → create HireJob → reveal
            synthetic quote → simulation approve → run fixture{" "}
            <span className="mono">success-aapl</span> → inspect evidence
            viewer.
          </li>
          <li>
            Compare with <Link href="/categories">Categories</Link> (taxonomy)
            and <Link href="/agents">Agents</Link> (identity directory).
          </li>
        </ol>
        <div className="callout danger">
          SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT
          WAS MADE. Other capabilities stay discoverable but hiring-blocked.
          Offline UI approval ≠ live auth.
        </div>
      </section>
    </>
  );
}
