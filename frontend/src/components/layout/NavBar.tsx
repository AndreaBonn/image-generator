import { Link, NavLink } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { CreateIcon, EditIcon, GalleryIcon, ImproveIcon, SettingsIcon } from "@/components/layout/NavIcons";

const NAV_ITEMS = [
  { to: "/", label: "Crea", Icon: CreateIcon },
  { to: "/modifica", label: "Modifica", Icon: EditIcon },
  { to: "/migliora", label: "Migliora", Icon: ImproveIcon },
  { to: "/galleria", label: "Galleria", Icon: GalleryIcon },
  { to: "/impostazioni", label: "Impostazioni", Icon: SettingsIcon },
];

function linkClassName({ isActive }: { isActive: boolean }): string {
  const base =
    "flex min-h-11 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-md px-1 py-1 text-[11px] font-medium transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:py-2 sm:text-sm";
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
      <span className="order-1 mr-4 text-sm font-semibold text-ink">Image Generator</span>
      <ul className="order-3 grid w-full grid-cols-5 gap-1 sm:order-2 sm:flex sm:w-auto">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={linkClassName} end={item.to === "/"}>
              <item.Icon />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <Link
        to="/guida"
        className="order-2 ml-auto flex min-h-11 shrink-0 items-center px-2 text-sm text-ink-muted underline hover:text-ink sm:order-3"
      >
        Come funziona
      </Link>
      <button
        type="button"
        onClick={toggleTheme}
        className="order-2 flex min-h-11 shrink-0 items-center rounded-md border border-border px-3 py-2 text-sm text-ink-muted hover:text-ink sm:order-3"
        aria-label={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
      >
        {theme === "dark" ? "Tema chiaro" : "Tema scuro"}
      </button>
    </nav>
  );
}
