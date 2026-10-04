import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyTrashDialog } from "@/components/gallery/EmptyTrashDialog";

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Apri
      </button>
      <button type="button">Fuori dal dialogo</button>
      {open && (
        <EmptyTrashDialog
          count={2}
          bytes={2048}
          isPending={false}
          onConfirm={onConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe("EmptyTrashDialog keyboard focus", () => {
  it("keeps Tab focus inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Apri" }));
    const dialog = screen.getByRole("dialog");

    for (let index = 0; index < 5; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let index = 0; index < 5; index += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    expect(screen.getByRole("button", { name: "Fuori dal dialogo" })).not.toHaveFocus();
  });

  it("returns focus to the button that opened it when closed with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Apri" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
