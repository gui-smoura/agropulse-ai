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
        canvas: "#111413",
        "surface-lowest": "#0d0f0e",
        "surface-subtle": "#141816",
        "surface-container": "#171b19",
        "surface-elevated": "#171b19",
        "surface-highlight": "#1f2421",
        "border-hairline": "#262c29",
        "agro-primary": "#22c55e",
        "agro-primary-bright": "#4cc38a",
        "agro-amber": "#d99b26",
        "agro-sky": "#529cca",
        "agro-rust": "#e5484d",
        "text-primary": "#eef2ef",
        "text-secondary": "#9aa59e",
        "text-tertiary": "#68736c",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
