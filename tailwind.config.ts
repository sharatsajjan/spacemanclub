import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b1023",
        panel: "#141b34",
        panel2: "#1b2444",
        accent: "#7c5cff",
        accent2: "#31e6c1",
        warn: "#ffb648",
        danger: "#ff5c7a",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124,92,255,0.35), 0 8px 30px -6px rgba(124,92,255,0.45)",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(124,92,255,0.55)" },
          "50%": { boxShadow: "0 0 0 8px rgba(124,92,255,0)" },
        },
      },
      animation: {
        pop: "pop 0.18s ease-out",
        pulseGlow: "pulseGlow 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
