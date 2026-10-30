import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#0a1611",
        "surface-lowest": "#05100c",
        "surface-subtle": "#121e19",
        "surface-container": "#16221d",
        "surface-elevated": "#1a2923",
        "surface-highlight": "#22362f",
        "border-hairline": "#2a3f37",
        "agro-primary": "#22c55e",
        "agro-primary-bright": "#4be277",
        "agro-amber": "#f59e0b",
        "agro-sky": "#38bdf8",
        "agro-rust": "#ef4444",
        "text-primary": "#f0fdf4",
        "text-secondary": "#9cb8aa",
        "text-tertiary": "#5d7d70",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        agro: "0 4px 20px -2px rgba(5, 12, 8, 0.55)",
        drawer: "0 20px 40px -10px rgba(0, 0, 0, 0.75)",
      },
    },
  },
  plugins: [],
};

export default config;
