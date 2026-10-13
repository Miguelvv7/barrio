import type { Metadata } from "next";
import { configuredBaseUrl } from "@/lib/base-url";
import "./globals.css";

const base = configuredBaseUrl();

export const metadata: Metadata = {
  // Absolute URLs for social previews; without it they'd point at localhost.
  metadataBase: base ? new URL(base) : undefined,
  title: { default: "Barrio — your neighbourhood on Alexa+", template: "%s · Barrio" },
  description:
    "Barrio gives small local businesses an MCP server in five minutes, so Alexa+ and other AI assistants can answer questions and take bookings for them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
