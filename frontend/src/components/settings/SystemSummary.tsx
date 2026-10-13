import { useId } from "react";
import type { ReadinessCheck } from "@/lib/readiness";

/** "Tutto pronto" or "Da sistemare" with one line per check (I1), above the technical cards. */
export function SystemSummary({ checks }: { checks: ReadinessCheck[] }) {
  const titleId = useId();
  const allOk = checks.every((check) => check.ok);
  return (
    <section
      aria-labelledby={titleId}
      className={`flex flex-col gap-2 rounded-md border bg-paper-2 p-3 ${allOk ? "border-success" : "border-warning"}`}
    >
      <h2 id={titleId} className={`text-base font-semibold ${allOk ? "text-success" : "text-warning"}`}>
        {allOk ? "Tutto pronto" : "Da sistemare"}
      </h2>
      <ul className="flex flex-col gap-1 text-sm text-ink sm:flex-row sm:flex-wrap sm:gap-x-6">
        {checks.map((check) => (
          <li key={check.text} className="flex items-center gap-2">
            <span aria-hidden="true" className={check.ok ? "text-success" : "text-warning"}>
              {check.ok ? "✓" : "!"}
            </span>
            <span>
              <span className="sr-only">{check.ok ? "A posto: " : "Da sistemare: "}</span>
              {check.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
