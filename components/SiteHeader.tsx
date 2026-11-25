import Link from "next/link";
import { DEMO_DISCLAIMER } from "../src/ui/trust-labels.ts";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="banner-demo" role="status">
        {DEMO_DISCLAIMER}
      </div>
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="AgentHire home">
          AgentHire
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link href="/">Discover</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/categories">Categories</Link>
          <Link href="/how-it-works">How It Works</Link>
          <Link href="/demo">Demo</Link>
        </nav>
      </div>
    </header>
  );
}
