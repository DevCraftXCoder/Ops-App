import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops App — Frxncois",
  description: "Workflow automation, monitoring, alerting & ticketing dashboard",
  metadataBase: new URL("https://ops-app.frxncois.workers.dev"),
  icons: { icon: "/3sixty-favicon.png", apple: "/3sixty-favicon.png" },
  openGraph: {
    title: "Ops App — Frxncois",
    description: "Workflow automation, monitoring, alerting & ticketing dashboard",
    type: "website",
    images: [{ url: "/3sixty-logo.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ops App — Frxncois",
    description: "Workflow automation, monitoring, alerting & ticketing dashboard",
    images: ["/3sixty-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
