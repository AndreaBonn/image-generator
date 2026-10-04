import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_MAX_WIDTH_PX = 280;
const TOOLTIP_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
// Grace period so the pointer can cross the gap onto the tooltip (WCAG 1.4.13 hoverable).
const HOVER_CLOSE_DELAY_MS = 150;

interface InfoTipProps {
  /** Short, plain-language explanation shown in the tooltip. */
  text: string;
  /** Accessible name of the trigger button, e.g. "Informazioni: Passi di generazione". */
  label: string;
}

/**
 * Small "?" button that reveals a short explanation next to a form control.
 * Opens on hover, focus and click/tap; closes on Escape, blur, outside click
 * and when the pointer leaves both trigger and tooltip (unless focused). The tooltip renders in a portal so it is never clipped by an
 * ancestor with `overflow: hidden/auto` (ui-ux.md, MaskEditor's scroll
 * container being the concrete case that forced this choice).
 */
export function InfoTip({ text, label }: InfoTipProps) {
  const reactId = useId();
  const tooltipId = `infotip-${reactId}`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  function cancelClose() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function openFromPointer() {
    cancelClose();
    setOpen(true);
  }

  function scheduleClose() {
    if (document.activeElement === triggerRef.current) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - TOOLTIP_MAX_WIDTH_PX / 2, VIEWPORT_MARGIN_PX),
        window.innerWidth - TOOLTIP_MAX_WIDTH_PX - VIEWPORT_MARGIN_PX,
      );
      setPosition({ top: rect.bottom + TOOLTIP_GAP_PX, left });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={openFromPointer}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] font-semibold leading-none"
        >
          ?
        </span>
        <span className="sr-only">{label}</span>
      </button>
      {open && position
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              onMouseEnter={openFromPointer}
              onMouseLeave={scheduleClose}
              style={{ position: "fixed", top: position.top, left: position.left, maxWidth: TOOLTIP_MAX_WIDTH_PX }}
              className="z-tooltip rounded-md border border-border bg-paper-3 px-3 py-2 text-xs text-ink shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
