import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskSelector } from "@/components/create/TaskSelector";
import { buildTask } from "../../fixtures/task";

describe("TaskSelector", () => {
  it("relies on the card descriptions, without a ? button (S3)", () => {
    render(<TaskSelector tasks={[buildTask({})]} selectedTaskId={null} onSelect={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Informazioni/ })).not.toBeInTheDocument();
  });

  it("asks what to create instead of naming a 'compito'", () => {
    render(<TaskSelector tasks={[buildTask({})]} selectedTaskId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("group", { name: /Cosa vuoi creare\?/ })).toBeInTheDocument();
    expect(screen.queryByText("Compito")).not.toBeInTheDocument();
  });

  it("shows the unavailable reason and disables the card", () => {
    const tasks = [
      buildTask({
        id: "foto",
        label: "Foto realistica",
        available: false,
        unavailable_reason: "Modello non installato, vedi Impostazioni.",
      }),
    ];

    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Foto realistica/ });
    expect(button).toBeDisabled();
    expect(screen.getByText("Modello non installato, vedi Impostazioni.")).toBeInTheDocument();
  });

  it("does not call onSelect for a disabled task", async () => {
    const onSelect = vi.fn();
    const tasks = [
      buildTask({ id: "foto", available: false, unavailable_reason: "Modello non installato." }),
    ];
    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /Immagine di qualità|Foto realistica/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect when an available task is clicked", async () => {
    const onSelect = vi.fn();
    const tasks = [buildTask({ id: "qualita", available: true })];
    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /Immagine di qualità/ }));
    expect(onSelect).toHaveBeenCalledWith("qualita");
  });
});
