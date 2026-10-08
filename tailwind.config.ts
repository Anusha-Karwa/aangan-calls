import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Terracotta, for an "aangan" (courtyard) feel.
        brand: {
          50: "#fbf5f1",
          100: "#f5e6dc",
          300: "#e0a98a",
          500: "#c4703f",
          600: "#a95a2f",
          700: "#8a4726",
        },
        ink: "#1f1a17",
        muted: "#6b625c",
        line: "#ebe4de",
        paper: "#faf8f6",
      },
    },
  },
  plugins: [],
};

export default config;
