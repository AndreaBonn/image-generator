import { useTheme, type Theme } from "@/hooks/useTheme";

export function ThemeCard() {
  const { theme, toggleTheme } = useTheme();

  function handleSelect(next: Theme) {
    if (next !== theme) toggleTheme();
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-3">
      <h2 className="text-sm font-semibold text-ink">Tema</h2>
      <div role="radiogroup" aria-label="Tema dell'interfaccia" className="flex gap-2">
        <ThemeOption label="Scuro" active={theme === "dark"} onSelect={() => handleSelect("dark")} />
        <ThemeOption label="Chiaro" active={theme === "light"} onSelect={() => handleSelect("light")} />
      </div>
    </section>
  );
}

function ThemeOption({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
        active ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
      }`}
    >
      {label}
    </button>
  );
}
