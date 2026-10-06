import { useState } from "react";

/** A terminal command shown verbatim with a "Copia" button (Settings: models, examples). */
export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded bg-paper-3 px-2 py-1 text-xs text-ink">{command}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-xs text-ink"
      >
        {copied ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}
