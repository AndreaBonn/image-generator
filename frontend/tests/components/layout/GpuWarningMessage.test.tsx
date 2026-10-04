import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GpuWarningMessage } from "@/components/layout/GpuWarningMessage";

describe("GpuWarningMessage", () => {
  it("lists every other process using the GPU", () => {
    render(
      <GpuWarningMessage
        processes={[
          { name: "ollama", used_mb: 6000 },
          { name: "blender", used_mb: 1200 },
        ]}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("ollama: 6000 MB");
    expect(alert).toHaveTextContent("blender: 1200 MB");
  });

  it("omits the process list when there are no other processes", () => {
    render(<GpuWarningMessage processes={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByText("Un altro programma sta usando la scheda video."),
    ).toBeInTheDocument();
  });
});
