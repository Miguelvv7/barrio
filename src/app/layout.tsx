import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
