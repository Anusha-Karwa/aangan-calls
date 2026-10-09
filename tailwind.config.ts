import type { Config } from "tailwindcss";

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
        lilac: { 50: "#fbf8ff", 100: "#f3edff" },
      },
    },
  },
  plugins: [],
};

export default config;
