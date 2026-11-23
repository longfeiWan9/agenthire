import Link from "next/link";

export default function NotFound() {
  return (
    <section className="hero">
      <p className="hero-brand">AgentHire</p>
      <h1>Not found</h1>
      <p className="lede">
        Unknown capability or category. IDs are validated against the local
        catalog; path traversal and URL-shaped ids are rejected.
      </p>
      <p>
        <Link href="/">Return to Discover</Link>
      </p>
    </section>
  );
}
