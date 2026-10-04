import { useRef, type KeyboardEvent } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabListProps<T extends string> {
  label: string;
  items: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
}

/** Index reached by a navigation key in a wrapping tab row, or null for other keys. */
function targetIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Row of tabs following the WAI-ARIA tabs pattern with automatic activation:
 * arrows, Home and End move and select, only the selected tab is in the Tab order.
 */
export function TabList<T extends string>({ label, items, selected, onSelect }: TabListProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = targetIndex(event.key, index, items.length);
    const item = next === null ? undefined : items[next];
    if (next === null || item === undefined) return;
    event.preventDefault();
    onSelect(item.id);
    buttons.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item, index) => {
        const isActive = item.id === selected;
        return (
          <button
            key={item.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
              isActive ? "border-accent bg-paper-3 text-ink" : "border-border bg-paper-2 text-ink-muted hover:bg-paper-3"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
