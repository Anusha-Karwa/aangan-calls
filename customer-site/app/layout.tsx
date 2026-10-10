import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", style: ["normal", "italic"], axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "Talk to Aangan · Interior design studio, Pune",
  description: "Tell us about your space and book a free 60-minute design consultation, in a 3-minute voice chat.",
};

export const viewport: Viewport = { themeColor: "#fbf8ff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
