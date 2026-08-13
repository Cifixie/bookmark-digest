import { useEffect, useState } from "react";

const THEME_KEY = "bd-theme";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

function getSystemPreference(): Theme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function getStoredTheme(): Theme | null {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.setProperty("--color-scheme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * ThemeToggle — switches between light and dark color-scheme.
 *
 * Respects the system preference by default (localStorage takes priority).
 * Persists the user's choice so it survives page reloads.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    return getStoredTheme() ?? getSystemPreference();
  });

  // Re-apply on mount (in case theme was set by another tab or server)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system preference changes when user hasn't explicitly set a theme
  useEffect(() => {
    if (getStoredTheme()) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setTheme(mql.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const toggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: "1px solid var(--border-primary)",
        background: "var(--bg-muted)",
        color: "var(--text-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        lineHeight: 1,
        padding: 0,
        transition: "background 0.2s, color 0.2s",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
