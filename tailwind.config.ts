import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        v3: {
          primary: "var(--v3-primary)",
          "primary-hover": "var(--v3-primary-hover)",
          "primary-soft": "var(--v3-primary-soft)",
          secondary: "var(--v3-secondary)",
          "secondary-soft": "var(--v3-secondary-soft)",
          accent: "var(--v3-accent)",
          "accent-hover": "var(--v3-accent-hover)",
          gold: "var(--v3-gold)",
          "gold-soft": "var(--v3-gold-soft)",
          bg: "var(--v3-bg)",
          surface: "var(--v3-surface)",
          border: "var(--v3-border)",
          text: {
            primary: "var(--v3-text-primary)",
            secondary: "var(--v3-text-secondary)",
            disabled: "var(--v3-text-disabled)",
            error: "var(--v3-text-error)",
          },
        },
      },
      fontFamily: {
        display: ["var(--v3-font-display)"],
        ui: ["var(--v3-font-ui)"],
        body: ["var(--v3-font-body)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "v3-sm": "var(--v3-r-sm)",
        v3: "var(--v3-r)",
        "v3-md": "var(--v3-r-md)",
        "v3-lg": "var(--v3-r-lg)",
        "v3-pill": "var(--v3-r-pill)",
      },
      boxShadow: {
        "v3-card": "var(--v3-shadow-card)",
        "v3-card-hover": "var(--v3-shadow-card-hover)",
        "v3-modal": "var(--v3-shadow-modal)",
        "v3-tooltip": "var(--v3-shadow-tooltip)",
        "v3-focus": "var(--v3-shadow-focus)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
