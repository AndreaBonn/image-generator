import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelsTable } from "@/components/settings/ModelsTable";
import { buildModelInfo } from "../../fixtures/system";

const INSTALL_COMMAND = "uv run --script scripts/install_models.py";

describe("ModelsTable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows label, status, size and license for every model", () => {
    render(
      <ModelsTable
        models={[
          buildModelInfo({
            id: "juggernaut-xl-v8",
            label: "Juggernaut XL v8",
            status: "installed",
            size_gb: 6.6,
            license: "CreativeML Open RAIL-M",
          }),
        ]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    expect(screen.getByText("Juggernaut XL v8")).toBeInTheDocument();
    expect(screen.getByText("Installato")).toBeInTheDocument();
    expect(screen.getByText("6,6 GB")).toBeInTheDocument();
    expect(screen.getByText("CreativeML Open RAIL-M")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informazioni: Modelli" })).toBeInTheDocument();
  });

  it("shows a dash for the size when it is not known", () => {
    render(
      <ModelsTable
        models={[buildModelInfo({ id: "m1", size_gb: null })]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("shows the install command for a model that is missing and enabled", () => {
    render(
      <ModelsTable
        models={[
          buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true }),
        ]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    expect(
      screen.getByText(`${INSTALL_COMMAND} flux2-klein`),
    ).toBeInTheDocument();
  });

  it("hides the install command for a model that is missing but disabled", () => {
    render(
      <ModelsTable
        models={[
          buildModelInfo({ id: "flux2-klein", status: "missing", enabled: false }),
        ]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    expect(screen.queryByText(`${INSTALL_COMMAND} flux2-klein`)).not.toBeInTheDocument();
  });

  it("hides the install command for a model that is already installed", () => {
    render(
      <ModelsTable
        models={[
          buildModelInfo({ id: "juggernaut-xl-v8", status: "installed", enabled: true }),
        ]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    expect(screen.queryByText(`${INSTALL_COMMAND} juggernaut-xl-v8`)).not.toBeInTheDocument();
  });

  it("copies the install command to the clipboard and shows confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ModelsTable
        models={[buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true })]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));

    expect(writeText).toHaveBeenCalledWith(`${INSTALL_COMMAND} flux2-klein`);
    expect(await screen.findByRole("button", { name: "Copiato" })).toBeInTheDocument();
  });

  it("keeps showing Copia when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ModelsTable
        models={[buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true })]}
        installCommand={INSTALL_COMMAND}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Copia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiato" })).not.toBeInTheDocument();
  });
});
