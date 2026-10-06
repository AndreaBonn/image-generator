import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamplesPanel } from "@/components/create/ExamplesPanel";
import { buildExampleItem } from "../../fixtures/example";
import { buildTask } from "../../fixtures/task";

describe("ExamplesPanel", () => {
  it("renders each example with its image, prompt and task label", () => {
    const task = buildTask({ id: "qualita", label: "Immagine di qualità" });
    const example = buildExampleItem();
    render(<ExamplesPanel examples={[example]} tasks={[task]} onTryExample={vi.fn()} />);

    expect(screen.getByText("Prova un esempio")).toBeInTheDocument();
    expect(screen.getByText("Immagine di qualità")).toBeInTheDocument();
    const img = screen.getByAltText(example.prompt);
    expect(img).toHaveAttribute("src", example.image_url);
    expect(img).toHaveAttribute("width", String(example.width));
    expect(img).toHaveAttribute("height", String(example.height));
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("fills the form without starting a job when 'Prova questo' is clicked", async () => {
    const task = buildTask({ id: "qualita", label: "Immagine di qualità" });
    const example = buildExampleItem({ task_id: "qualita" });
    const onTryExample = vi.fn();
    render(<ExamplesPanel examples={[example]} tasks={[task]} onTryExample={onTryExample} />);

    await userEvent.click(screen.getByRole("button", { name: "Prova questo" }));

    expect(onTryExample).toHaveBeenCalledWith({
      taskId: example.task_id,
      prompt: example.prompt,
      seed: example.seed,
      aspectRatio: example.aspect_ratio,
    });
  });

  it("falls back to a text-only variant using prompt_examples when no example image exists", () => {
    const task = buildTask({
      id: "qualita",
      label: "Immagine di qualità",
      available: true,
      prompt_examples: ["a lighthouse at dusk, cinematic"],
    });
    render(<ExamplesPanel examples={[]} tasks={[task]} onTryExample={vi.fn()} />);

    expect(screen.getByText("Prova un esempio")).toBeInTheDocument();
    expect(screen.getByText("a lighthouse at dusk, cinematic")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prova questo" })).toBeInTheDocument();
  });

  it("text-only variant's 'Prova questo' omits seed and aspect ratio", async () => {
    const task = buildTask({
      id: "qualita",
      label: "Immagine di qualità",
      available: true,
      prompt_examples: ["a lighthouse at dusk, cinematic"],
    });
    const onTryExample = vi.fn();
    render(<ExamplesPanel examples={[]} tasks={[task]} onTryExample={onTryExample} />);

    await userEvent.click(screen.getByRole("button", { name: "Prova questo" }));

    expect(onTryExample).toHaveBeenCalledWith({
      taskId: "qualita",
      prompt: "a lighthouse at dusk, cinematic",
    });
  });

  it("excludes unavailable tasks from the text-only variant", () => {
    const available = buildTask({ id: "qualita", available: true, prompt_examples: ["x"] });
    const unavailable = buildTask({ id: "veloce", available: false, prompt_examples: ["y"] });
    render(<ExamplesPanel examples={[]} tasks={[available, unavailable]} onTryExample={vi.fn()} />);

    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.queryByText("y")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no examples and no eligible task", () => {
    const unavailable = buildTask({ id: "veloce", available: false, prompt_examples: ["y"] });
    const { container } = render(
      <ExamplesPanel examples={[]} tasks={[unavailable]} onTryExample={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
