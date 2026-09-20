import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme-driven surfaces — actual values come from CSS variables set
        // per-theme in lib/themes.ts / applied via ThemeStyle.
        outer: "var(--outer)",
        panel: "var(--panel)",
        maze: "var(--maze)",
        text: "var(--text)",
        sub: "var(--sub)",
        sub2: "var(--sub2)",
        accent: "var(--accent)",
        accent2: "var(--accent2)",
        accent3: "var(--accent3)",
        line: "var(--line)",
        btntext: "var(--btn-text)",
        chip: "var(--chip)",
        danger: "var(--danger)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        flash: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        pop: "pop 0.18s ease-out",
        flash: "flash 0.3s ease-in-out 2",
      },
    },
  },
  plugins: [],
};
export default config;
