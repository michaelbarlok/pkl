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
        brand: {
          50: "#faf5fa",
          100: "#f3e8f4",
          200: "#e5cfe7",
          300: "#d0aed3",
          400: "#b483b8",
          500: "#88498F",
          600: "#7a3f80",
          700: "#6a3570",
          800: "#572b5c",
          900: "#46234a",
        },
        accent: {
          50: "#fff6f3",
          100: "#ffe9e2",
          200: "#ffd1c4",
          300: "#ffb19c",
          400: "#ff8b6e",
          500: "#FF6542",
          600: "#e8522e",
          700: "#c4411f",
          800: "#a03618",
          900: "#7d2d15",
        },
        teal: {
          50: "#f3f8f8",
          100: "#e2eeef",
          200: "#c5dde0",
          300: "#a3c8cb",
          400: "#8db4b6",
          500: "#779FA1",
          600: "#628789",
          700: "#516f71",
          800: "#445c5d",
          900: "#3a4e4f",
        },
        cream: {
          50: "#fdfcf9",
          100: "#faf6ee",
          200: "#f3ecdb",
          300: "#E0CBA8",
          400: "#d4ba8e",
          500: "#c4a474",
          600: "#a98a5c",
          700: "#8b704a",
          800: "#725c3e",
          900: "#5e4c34",
        },
        dark: {
          50: "#f5f3f5",
          100: "#e8e3e7",
          200: "#d0c6ce",
          300: "#b0a1ad",
          400: "#897587",
          500: "#6b5768",
          600: "#564154",
          700: "#473647",
          800: "#3b2c3b",
          900: "#2f2330",
        },
      },
    },
  },
  plugins: [],
};

export default config;
