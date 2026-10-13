import type { ReactNode } from "react";

/** Line icons for the main nav (S5): decorative, the label stays the accessible name. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {children}
    </svg>
  );
}

export function CreateIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function EditIcon() {
  return (
    <Icon>
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
    </Icon>
  );
}

export function ImproveIcon() {
  return (
    <Icon>
      <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
    </Icon>
  );
}

export function GalleryIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </Icon>
  );
}
