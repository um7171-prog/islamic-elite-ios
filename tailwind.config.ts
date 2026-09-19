import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Extra step for hero/feature-level cards that intentionally read
        // larger than the standard --radius — a named token instead of a
        // one-off arbitrary rounded-[Npx] value in each component.
        "card-lg": "calc(var(--radius) + 0.5rem)",
      },
      // Typography scale (Phase 15) — semantic sizes so pages reach for
      // text-h2 / text-body / text-label instead of picking an arbitrary
      // text-[11px] each time. Sizes are mobile-first (this app is phone-
      // only); each tuple also pins line-height/tracking/weight so a
      // heading or label looks the same wherever it's used.
      fontSize: {
        display: ["2.125rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "800" }], // 34px — hero countdown / splash numerals
        h1: ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.015em", fontWeight: "800" }],        // 28px — page-level heading
        h2: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "700" }],       // 22px — section heading
        h3: ["1.125rem", { lineHeight: "1.3", fontWeight: "700" }],                                  // 18px — card / group title
        "body-lg": ["1.0625rem", { lineHeight: "1.5", fontWeight: "600" }],                          // 17px — primary readable content (prayer names, key values)
        body: ["0.9375rem", { lineHeight: "1.5", fontWeight: "500" }],                                // 15px — standard UI text
        "body-sm": ["0.8125rem", { lineHeight: "1.45", fontWeight: "500" }],                          // 13px — secondary text
        label: ["0.75rem", { lineHeight: "1.3", letterSpacing: "0.01em", fontWeight: "700" }],        // 12px — form/field labels, tags
        caption: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.01em", fontWeight: "600" }],    // 11px — timestamps/meta only, never primary content
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.35s ease-out both",
        "scale-in": "scale-in 0.3s ease-out both",
      },

    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
