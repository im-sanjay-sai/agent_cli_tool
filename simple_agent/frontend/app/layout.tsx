import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quill CLI Agent",
  description: "Chat with an AI agent that manages your Quill BI dashboards via CLI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
