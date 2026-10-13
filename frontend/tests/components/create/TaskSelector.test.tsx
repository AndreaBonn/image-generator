import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("splits tasks into text-only and from-your-images groups (C3)", () => {
    const tasks = [
      buildTask({ id: "bozza", label: "Bozza veloce", min_references: 0 }),
      buildTask({ id: "in_posa", label: "In posa", min_references: 2 }),
    ];

    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={vi.fn()} />);

    const fromText = screen.getByRole("group", { name: "Da una descrizione" });
    const fromImages = screen.getByRole("group", { name: "Partendo da tue immagini" });
    expect(within(fromText).getByRole("button", { name: /Bozza veloce/ })).toBeInTheDocument();
    expect(within(fromImages).getByRole("button", { name: /In posa/ })).toBeInTheDocument();
  });

  it("tags each card with its time, its language and whether it is ready now (C4)", () => {
    const tasks = [
      buildTask({ id: "bozza", label: "Bozza veloce", family: "sdxl", duration_hint: "circa 4 s" }),
      buildTask({
        id: "foto",
        label: "Foto realistica",
        family: "zimage",
        duration_hint: "circa 17 s",
        prompt_language: { required: "any", label: "Italiano o inglese", reason: "Capisce entrambe." },
      }),
    ];

    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={vi.fn()} loadedFamily="sdxl" />);

    const draft = screen.getByRole("button", { name: /Bozza veloce/ });
    const photo = screen.getByRole("button", { name: /Foto realistica/ });
    expect(draft).toHaveTextContent("circa 4 s");
    expect(draft).toHaveTextContent("in inglese");
    expect(draft).toHaveTextContent("pronto subito");
    expect(photo).toHaveTextContent("circa 17 s");
    expect(photo).toHaveTextContent("anche in italiano");
    expect(photo).not.toHaveTextContent("pronto subito");
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

  it("offers the download of missing models instead of selecting the task", async () => {
    const onSelect = vi.fn();
    const onRequestModels = vi.fn();
    const task = buildTask({
      id: "bozza",
      label: "Bozza veloce",
      available: false,
      unavailable_reason: "Modelli non installati: Juggernaut XL v8. Esegui uv run ...",
      missing_model_ids: ["juggernaut_xl_v8"],
    });
    render(
      <TaskSelector tasks={[task]} selectedTaskId={null} onSelect={onSelect} onRequestModels={onRequestModels} />,
    );

    const card = screen.getByRole("button", { name: /Bozza veloce/ });
    expect(card).toBeEnabled();
    expect(card).toHaveTextContent("Mancano dei modelli: clicca per scaricarli.");
    expect(card).not.toHaveTextContent("Esegui uv run");
    await userEvent.click(card);
    expect(onRequestModels).toHaveBeenCalledWith(task);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps a task with missing models disabled when no download handler is given", () => {
    const task = buildTask({
      label: "Bozza veloce",
      available: false,
      unavailable_reason: "Modelli non installati.",
      missing_model_ids: ["juggernaut_xl_v8"],
    });
    render(<TaskSelector tasks={[task]} selectedTaskId={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Bozza veloce/ })).toBeDisabled();
  });

  it("calls onSelect when an available task is clicked", async () => {
    const onSelect = vi.fn();
    const tasks = [buildTask({ id: "qualita", available: true })];
    render(<TaskSelector tasks={tasks} selectedTaskId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /Immagine di qualità/ }));
    expect(onSelect).toHaveBeenCalledWith("qualita");
  });
});
