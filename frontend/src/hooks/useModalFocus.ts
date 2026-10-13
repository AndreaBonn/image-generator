import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour shared by modal dialogs: focuses the dialog on mount, keeps
 * Tab inside it, closes on Escape, and restores focus to the opener on unmount.
 */
export function useModalFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [dialogRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) keepTabInside(event, dialogRef.current);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dialogRef, onClose]);
}

/** Wraps Tab and Shift+Tab around the dialog's first and last focusable elements. */
function keepTabInside(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isInside = dialog.contains(document.activeElement);

  if (event.shiftKey && (document.activeElement === first || !isInside)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !isInside)) {
    event.preventDefault();
    first?.focus();
  }
}
