import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GpuCard } from "@/components/settings/GpuCard";
import { buildGpuInfo } from "../../fixtures/system";

describe("GpuCard", () => {
  it("shows the cleaned GPU name and the free/total VRAM", () => {
    render(
      <GpuCard
        gpu={buildGpuInfo({
          name: "cuda:0 NVIDIA GeForce RTX 4060 Laptop : cudaMallocAsync",
          vram_total_mb: 8192,
          vram_free_mb: 7168,
        })}
      />,
    );

    expect(screen.getByText("NVIDIA GeForce RTX 4060 Laptop")).toBeInTheDocument();
    expect(screen.getByText("7,0 GB liberi di 8,0 GB")).toBeInTheDocument();
  });

  it("computes the used-VRAM percentage for the progress bar", () => {
    render(<GpuCard gpu={buildGpuInfo({ vram_total_mb: 8000, vram_free_mb: 2000 })} />);

    expect(screen.getByRole("progressbar", { name: "VRAM in uso" })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
  });

  it("falls back to 0% used when the reported VRAM total is zero", () => {
    render(<GpuCard gpu={buildGpuInfo({ vram_total_mb: 0, vram_free_mb: 0 })} />);

    expect(screen.getByRole("progressbar", { name: "VRAM in uso" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("shows the contention warning when another process holds the GPU", () => {
    render(
      <GpuCard
        gpu={buildGpuInfo({ other_processes: [{ name: "ollama", used_mb: 6000 }] })}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("ollama: 6000 MB");
  });

  it("hides the contention warning when no other process is using the GPU", () => {
    render(<GpuCard gpu={buildGpuInfo({ other_processes: [] })} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers an InfoTip explaining the VRAM reading (A9)", () => {
    render(<GpuCard gpu={buildGpuInfo()} />);

    expect(screen.getByRole("button", { name: "Informazioni: Scheda video" })).toBeInTheDocument();
  });
});
