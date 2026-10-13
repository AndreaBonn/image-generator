import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeedField } from "@/components/create/SeedField";

describe("SeedField", () => {
  it("disables the number input and checks 'Casuale' when seed is null", () => {
    render(<SeedField seed={null} locked={false} onChange={vi.fn()} onToggleLocked={vi.fn()} />);

    const input = screen.getByLabelText("Codice del risultato") as HTMLInputElement;
    expect(input).toBeDisabled();
    expect(input.value).toBe("");
    expect(screen.getByRole("checkbox", { name: "Casuale" })).toBeChecked();
  });

  it("enables the number input and unchecks 'Casuale' when seed has a value", () => {
    render(<SeedField seed={42} locked={false} onChange={vi.fn()} onToggleLocked={vi.fn()} />);

    const input = screen.getByLabelText("Codice del risultato") as HTMLInputElement;
    expect(input).toBeEnabled();
    expect(input.value).toBe("42");
    expect(screen.getByRole("checkbox", { name: "Casuale" })).not.toBeChecked();
  });

  it("calls onChange(null) when 'Casuale' is checked", async () => {
    const onChange = vi.fn();
    render(<SeedField seed={42} locked={false} onChange={onChange} onToggleLocked={vi.fn()} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Casuale" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange(0) when 'Casuale' is unchecked", async () => {
    const onChange = vi.fn();
    render(<SeedField seed={null} locked={false} onChange={onChange} onToggleLocked={vi.fn()} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Casuale" }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("calls onChange with the parsed number when a valid value is typed", () => {
    const onChange = vi.fn();
    render(<SeedField seed={42} locked={false} onChange={onChange} onToggleLocked={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Codice del risultato"), { target: { value: "123" } });
    expect(onChange).toHaveBeenCalledWith(123);
  });

  // NOTE: the `Number.isFinite(parsed) ? parsed : null` fallback in SeedField.tsx is not
  // reachable here: jsdom and Chromium both sanitize an out-of-range value such as "1e500"
  // to "" (Number("") is 0). It is kept as a guard for browsers not measured (Firefox).

  it("shows 'Tieni questo codice' and aria-pressed=false when not locked", () => {
    render(<SeedField seed={42} locked={false} onChange={vi.fn()} onToggleLocked={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Tieni questo codice" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("shows 'Codice tenuto' and aria-pressed=true when locked", () => {
    render(<SeedField seed={42} locked={true} onChange={vi.fn()} onToggleLocked={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Codice tenuto" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggleLocked with the opposite of the current locked state", async () => {
    const onToggleLocked = vi.fn();
    render(<SeedField seed={42} locked={false} onChange={vi.fn()} onToggleLocked={onToggleLocked} />);

    await userEvent.click(screen.getByRole("button", { name: "Tieni questo codice" }));
    expect(onToggleLocked).toHaveBeenCalledWith(true);
  });
});
