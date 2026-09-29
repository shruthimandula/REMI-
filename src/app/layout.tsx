import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Remi — Support that remembers | Team Zenith",
  description:
    "Remi is an AI Customer Support Agent with full customer memory. Built by Team Zenith. Four memory layers, agent reasoning trace, frustration engine, and customer portal.",
  keywords: [
    "AI customer support",
    "memory agent",
    "Team Zenith",
    "customer memory",
  ],
  authors: [
    { name: "Team Zenith" },
    { name: "Rupa Hasini" },
    { name: "Pravallika" },
    { name: "Shruthi" },
    { name: "Madhurima" },
    { name: "Tasneem" },
  ],
  openGraph: {
    title: "Remi — Support that remembers",
    description:
      "AI Customer Support Agent with four-layer memory. Never makes customers repeat their story. Built by Team Zenith.",
    type: "website",
    url: "https://hackwithhyderabad.netlify.app/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="aurora-bg" aria-hidden="true" />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}
