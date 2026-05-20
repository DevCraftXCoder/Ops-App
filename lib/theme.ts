export const theme = {
  // Brand
  primary: "#a855f7",
  primaryHover: "#9333ea",
  accent: "#7c3aed",

  // Backgrounds
  bg: "#0a0a0a",
  bgCard: "#111111",
  bgHover: "#1a1a1a",
  bgInput: "#1c1c1c",

  // Borders
  border: "#2a2a2a",
  borderFocus: "#a855f7",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#888888",
  textMuted: "#555555",

  // Status
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
} as const;

export type ThemeColor = keyof typeof theme;
