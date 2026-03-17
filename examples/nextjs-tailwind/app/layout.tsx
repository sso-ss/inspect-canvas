import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "inspect-canvas Demo — Next.js + Tailwind",
  description: "A demo app for testing inspect-canvas Phase 3 support",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
