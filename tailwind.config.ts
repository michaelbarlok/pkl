import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — court teal
        brand: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        // Accent — amber (ball color)
        accent: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        // Teal kept for success/win indicators (same as brand now)
        teal: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
        // Neutral dark scale — carbon gray (CSS-variable driven for light mode)
        dark: {
          50:  "var(--color-dark-50)",
          100: "var(--color-dark-100)",
          200: "var(--color-dark-200)",
          300: "var(--color-dark-300)",
          400: "var(--color-dark-400)",
          500: "var(--color-dark-500)",
          600: "var(--color-dark-600)",
          700: "var(--color-dark-700)",
          800: "var(--color-dark-800)",
          900: "var(--color-dark-900)",
          950: "var(--color-dark-950)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised:  "var(--color-surface-raised)",
          overlay: "var(--color-surface-overlay)",
          border:  "var(--color-surface-border)",
          muted:   "var(--color-surface-muted)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
