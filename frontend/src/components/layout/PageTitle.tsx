import type { ReactNode } from "react";

/**
 * Page heading kept for screen readers and document outline only: the
 * active tab in the nav bar already names the page (proposal S1).
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="sr-only">{children}</h1>;
}
