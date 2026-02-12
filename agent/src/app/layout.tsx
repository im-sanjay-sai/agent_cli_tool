import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quill AI Agent",
  description: "Chat with AI to manage your Quill BI dashboards, reports, and data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
