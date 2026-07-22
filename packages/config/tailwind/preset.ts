const preset = {
  theme: {
    extend: {
      colors: {
        background: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        border: "var(--border)",
        text: {
          primary: "var(--text-primary)",
          muted: "var(--text-muted)",
        },
        accent: "var(--accent)",
        long: "var(--long)",
        short: "var(--short)",
        warning: "var(--warning)",
        algo: "var(--algo)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
};

export default preset;
