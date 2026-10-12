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
        background: "var(--background)",
        foreground: "var(--foreground)",
        celo: {
          green: "#35D07F",
          gold: "#FBCC5C",
          dark: "#1E293B",
        },
        app: {
          bg: "#080C12",
          deep: "#0B1119",
        },
        glass: {
          surface: "rgba(20, 29, 42, 0.64)",
          hover: "rgba(30, 43, 59, 0.76)",
          elevated: "rgba(24, 35, 51, 0.85)",
          border: "rgba(180, 205, 220, 0.14)",
          "border-active": "rgba(134, 227, 176, 0.38)",
        },
        accent: {
          primary: "#86E3B0",
          secondary: "#82B8FF",
        },
        status: {
          warning: "#F1C27D",
          error: "#F28B82",
        },
      },
      boxShadow: {
        "glass-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        "glass-md": "0 4px 16px -2px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        "glass-lg": "0 12px 32px -4px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
        "glow-emerald": "0 0 20px -4px rgba(134, 227, 176, 0.25)",
      },
      backdropBlur: {
        glass: "12px",
        overlay: "16px",
      },
    },
  },
  plugins: [],
};
export default config;
