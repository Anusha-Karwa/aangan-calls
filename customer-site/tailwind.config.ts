import type { Config } from "tailwindcss";

// Same tokens as the studio dashboard so both sites feel like one brand.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        ink: "#1d1430",
        muted: "#6b6280",
      },
    },
  },
  plugins: [],
};

export default config;
