import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EngineStatusCard } from "@/components/settings/EngineStatusCard";

describe("EngineStatusCard", () => {
  it("shows 'Acceso.' with no version suffix when comfyui_version is null", () => {
    render(<EngineStatusCard engine={{ status: "ok", comfyui_version: null }} />);

    expect(screen.getByText("Acceso.")).toBeInTheDocument();
  });

  it("appends the ComfyUI version when it is known", () => {
    render(<EngineStatusCard engine={{ status: "ok", comfyui_version: "0.3.0" }} />);

    expect(screen.getByText("Acceso, versione 0.3.0.")).toBeInTheDocument();
  });

  it("shows the unreachable message when the engine does not respond", () => {
    render(<EngineStatusCard engine={{ status: "unreachable", comfyui_version: null }} />);

    expect(screen.getByText("Non risponde.")).toBeInTheDocument();
    expect(screen.queryByText("Acceso.")).not.toBeInTheDocument();
  });

  it("offers an InfoTip explaining the engine status (A9)", () => {
    render(<EngineStatusCard engine={{ status: "ok", comfyui_version: null }} />);

    expect(screen.getByRole("button", { name: "Informazioni: Motore" })).toBeInTheDocument();
  });
});
