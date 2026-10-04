import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdvancedOptions } from "@/components/create/AdvancedOptions";
import { buildTask } from "../../fixtures/task";

describe("AdvancedOptions", () => {
  it("is closed by default and hides the fields (SPEC.md § 11.2)", () => {
    render(
      <AdvancedOptions
        task={buildTask()}
        steps={null}
        cfg={null}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Opzioni avanzate/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/Passi di generazione/)).not.toBeInTheDocument();
  });

  it("opens on click and shows steps/cfg with the task defaults when values are null", async () => {
    const task = buildTask({
      limits: { steps: { min: 10, max: 60 }, cfg: { min: 1, max: 12 } },
      defaults: { steps: 30, cfg: 4 },
    });
    render(
      <AdvancedOptions
        task={task}
        steps={null}
        cfg={null}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    expect(screen.getByRole("button", { name: /Opzioni avanzate/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const stepsInput = screen.getByLabelText(/Passi di generazione/) as HTMLInputElement;
    expect(stepsInput.value).toBe("30");
    expect(stepsInput).toHaveAttribute("min", "10");
    expect(stepsInput).toHaveAttribute("max", "60");

    const cfgInput = screen.getByLabelText(/Aderenza al prompt/) as HTMLInputElement;
    expect(cfgInput.value).toBe("4");
    expect(cfgInput).toHaveAttribute("min", "1");
    expect(cfgInput).toHaveAttribute("max", "12");
  });

  it("shows the explicit steps/cfg values instead of the defaults once set", async () => {
    render(
      <AdvancedOptions
        task={buildTask({ defaults: { steps: 30, cfg: 4 } })}
        steps={45}
        cfg={7.5}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    expect((screen.getByLabelText(/Passi di generazione/) as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText(/Aderenza al prompt/) as HTMLInputElement).value).toBe("7.5");
  });

  it("calls onStepsChange and onCfgChange with the parsed number on input", async () => {
    const onStepsChange = vi.fn();
    const onCfgChange = vi.fn();
    render(
      <AdvancedOptions
        task={buildTask()}
        steps={30}
        cfg={4}
        negativePrompt=""
        onStepsChange={onStepsChange}
        onCfgChange={onCfgChange}
        onNegativePromptChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    const stepsInput = screen.getByLabelText(/Passi di generazione/);
    fireEvent.change(stepsInput, { target: { value: "50" } });
    expect(onStepsChange).toHaveBeenCalledWith(50);

    const cfgInput = screen.getByLabelText(/Aderenza al prompt/);
    fireEvent.change(cfgInput, { target: { value: "8" } });
    expect(onCfgChange).toHaveBeenCalledWith(8);
  });

  it("shows the plain-language CFG tooltip via InfoTip", async () => {
    render(
      <AdvancedOptions
        task={buildTask()}
        steps={30}
        cfg={4}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    const infoTip = screen.getByRole("button", { name: "Informazioni: Aderenza al prompt" });
    await userEvent.hover(infoTip);

    expect(
      screen.getByText(/Quanto l'immagine deve seguire fedelmente il testo scritto/),
    ).toBeInTheDocument();
  });

  it("renders the negative prompt field when the task supports it, and calls onNegativePromptChange", async () => {
    const onNegativePromptChange = vi.fn();
    render(
      <AdvancedOptions
        task={buildTask({ supports_negative: true })}
        steps={30}
        cfg={4}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={onNegativePromptChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    const negativeField = screen.getByLabelText(/Prompt negativo/);
    fireEvent.change(negativeField, { target: { value: "blurry" } });
    expect(onNegativePromptChange).toHaveBeenCalledWith("blurry");
  });

  it("hides the negative prompt field when the task does not support it", async () => {
    render(
      <AdvancedOptions
        task={buildTask({ supports_negative: false })}
        steps={30}
        cfg={4}
        negativePrompt=""
        onStepsChange={vi.fn()}
        onCfgChange={vi.fn()}
        onNegativePromptChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Opzioni avanzate/ }));

    expect(screen.queryByLabelText(/Prompt negativo/)).not.toBeInTheDocument();
  });
});
