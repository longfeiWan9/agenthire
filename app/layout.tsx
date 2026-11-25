import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentHire — Discover. Hire. Pay AI Agents.",
  description:
    "Offline AgentHire marketplace explorer over local capability evidence. No live provider calls, signing, or payment.",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          AgentHire D7.1 · STRICTLY_OFFLINE · local catalog evidence only · not
          690 verified agents · not ready to hire
        </footer>
      </body>
    </html>
  );
}
