import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        up: "#22c55e",
        down: "#ef4444",
        panel: "#1a1a2e",
        surface: "#16213e",
        accent: "#0f3460",
        "sol-purple": "#9945FF",
        "sol-teal": "#14F195",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s ease-out both",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "pulse-urgent": "pulseUrgent 0.5s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        shake: "shake 0.4s ease-in-out infinite",
        "bounce-in": "bounceIn 0.5s cubic-bezier(0.68,-0.55,0.27,1.55) both",
        float: "float 6s ease-in-out infinite",
        "bar-fill": "barFill 0.8s ease-out both",
        "glow-border": "glowBorder 3s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 15px rgba(153,69,255,0.3), 0 0 30px rgba(20,241,149,0.15)" },
          "50%": { boxShadow: "0 0 25px rgba(153,69,255,0.5), 0 0 50px rgba(20,241,149,0.25)" },
        },
        pulseUrgent: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-3px)" },
          "75%": { transform: "translateX(3px)" },
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        barFill: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        glowBorder: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      boxShadow: {
        sol: "0 0 15px rgba(153,69,255,0.3)",
        "sol-lg": "0 0 30px rgba(153,69,255,0.4), 0 0 60px rgba(20,241,149,0.15)",
        "up-glow": "0 0 20px rgba(34,197,94,0.4), 0 4px 15px rgba(34,197,94,0.2)",
        "down-glow": "0 0 20px rgba(239,68,68,0.4), 0 4px 15px rgba(239,68,68,0.2)",
        claim: "0 0 25px rgba(153,69,255,0.4), 0 0 50px rgba(20,241,149,0.2)",
      },
      backgroundImage: {
        "sol-gradient": "linear-gradient(135deg, #9945FF, #14F195)",
        "sol-gradient-h": "linear-gradient(90deg, #9945FF, #14F195)",
      },
    },
  },
  plugins: [],
};

export default config;
