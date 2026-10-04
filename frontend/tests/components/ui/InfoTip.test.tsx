import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTip } from "@/components/ui/InfoTip";

const TEXT = "Il pennello disegna, la gomma cancella.";
const LABEL = "Informazioni: pennello e gomma";

describe("InfoTip", () => {
  it("is closed by default", () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on hover and sets aria-describedby on the trigger", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    await userEvent.hover(trigger);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(TEXT);
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("opens on focus", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    fireEvent.focus(trigger);

    expect(screen.getByRole("tooltip")).toHaveTextContent(TEXT);
  });

  it("opens on click", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    await userEvent.click(trigger);

    expect(screen.getByRole("tooltip")).toHaveTextContent(TEXT);
  });

  it("closes on Escape", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    await userEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on blur", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(trigger);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on outside click", async () => {
    render(
      <div>
        <InfoTip text={TEXT} label={LABEL} />
        <button type="button">Altrove</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: LABEL });

    await userEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Altrove" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("removes aria-describedby once closed", () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });

    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("closes when the pointer leaves a hover-opened tip", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("stays open while the pointer moves from the trigger onto the tooltip (WCAG 1.4.13)", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });
    fireEvent.mouseEnter(trigger);

    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(screen.getByRole("tooltip")).toHaveTextContent(TEXT);
  });

  it("stays open on pointer leave while the trigger has keyboard focus", async () => {
    render(<InfoTip text={TEXT} label={LABEL} />);
    const trigger = screen.getByRole("button", { name: LABEL });
    trigger.focus();

    fireEvent.mouseLeave(trigger);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
