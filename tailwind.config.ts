import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#D97706",
          50: "#FFF8EB",
          100: "#FEECC7",
          200: "#FDD889",
          300: "#FCC44B",
          400: "#FBAD23",
          500: "#D97706",
          600: "#BD5D04",
          700: "#9A4407",
          800: "#7D350C",
          900: "#682C10",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "#737373",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        border: "var(--border)",
        ring: "var(--ring)",
      },
      fontFamily: {
        serif: ["Noto Serif JP", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
