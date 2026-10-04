import { NavLink } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";

const NAV_ITEMS = [
  { to: "/", label: "Crea" },
  { to: "/modifica", label: "Modifica" },
  { to: "/migliora", label: "Migliora" },
  { to: "/galleria", label: "Galleria" },
  { to: "/impostazioni", label: "Impostazioni" },
];

function linkClassName({ isActive }: { isActive: boolean }): string {
  const base =
    "flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors";
  return isActive
    ? `${base} bg-paper-3 text-ink`
    : `${base} text-ink-muted hover:bg-paper-2 hover:text-ink`;
}

export function NavBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav
      aria-label="Navigazione principale"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-paper-2 px-4 py-2"
    >
      <span className="mr-4 text-sm font-semibold text-ink">Studio Immagini</span>
      <ul className="flex flex-wrap gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={linkClassName} end={item.to === "/"}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={toggleTheme}
        className="ml-auto flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:text-ink"
        aria-label={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
      >
        {theme === "dark" ? "Tema chiaro" : "Tema scuro"}
      </button>
    </nav>
  );
}
