import Link from "next/link";
import { SEC_IDENTITY_CAPABILITY_ID } from "../../src/adapters/quantjourney-sec-identity.ts";

export const dynamic = "force-static";

export default function DemoPage() {
  return (
    <>
      <section className="hero">
        <p className="hero-brand">AgentHire</p>
        <h1>Offline demo</h1>
        <p className="lede">
          End-to-end marketplace journey on local evidence only. CLI demos
          remain available via <span className="mono">pnpm demo:hirejob:offline</span>{" "}
          and <span className="mono">pnpm demo:hirejob:quote:offline</span>.
        </p>
      </section>
      <section className="panel">
        <h2>Suggested path</h2>
        <ol>
          <li>
            <Link href="/">Discover</Link> — search the catalog (try “SEC” or
            “identity”).
          </li>
          <li>
            <Link href="/categories">Categories</Link> — open Research &amp;
            Intelligence or Data &amp; Analytics.
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
              Try offline demo
            </Link>
            : validate ticker AAPL → create HireJob → reveal synthetic quote →
            simulation approve → run fixture <span className="mono">success-aapl</span>.
          </li>
        </ol>
        <div className="callout danger">
          SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT
          WAS MADE. Other capabilities stay discoverable but hiring-blocked.
        </div>
      </section>
    </>
  );
}
