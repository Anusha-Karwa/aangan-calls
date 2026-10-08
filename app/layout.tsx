import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aangan Studio · Calls",
  description: "Every call, qualified and prepped for the designer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
