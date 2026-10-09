import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: "Aangan Studio · Calls",
  description: "Every call, qualified and prepped for the designer.",
};

export const viewport: Viewport = { themeColor: "#fbf8ff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="ambient font-sans antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
