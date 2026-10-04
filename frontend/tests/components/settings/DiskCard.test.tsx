import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DiskCard } from "@/components/settings/DiskCard";

function renderDiskCard(props: Parameters<typeof DiskCard>[0]) {
  return render(
    <MemoryRouter>
      <DiskCard {...props} />
    </MemoryRouter>,
  );
}

describe("DiskCard", () => {
  it("shows the disk space in red when it is below the configured minimum", () => {
    renderDiskCard({ disk: { free_gb: 3, min_free_gb: 10 } });

    const text = screen.getByText(/3,0 GB liberi/);
    expect(text).toHaveClass("text-danger");
    expect(text).toHaveTextContent("minimo consigliato 10,0 GB");
  });

  it("offers an InfoTip explaining the disk reading (A9)", () => {
    renderDiskCard({ disk: { free_gb: 40, min_free_gb: 10 } });

    expect(screen.getByRole("button", { name: "Informazioni: Disco" })).toBeInTheDocument();
  });

  it("hides the trash line when there is nothing in the trash", () => {
    renderDiskCard({ disk: { free_gb: 40, min_free_gb: 10 }, trashSummary: { count: 0, bytes: 0 } });

    expect(screen.queryByText(/Cestino:/)).not.toBeInTheDocument();
  });

  it("shows the trash size and a link to the trash view when it holds images (A4)", () => {
    renderDiskCard({
      disk: { free_gb: 40, min_free_gb: 10 },
      trashSummary: { count: 3, bytes: 12 * 1024 ** 2 },
    });

    expect(screen.getByText(/Cestino: 3 immagini \(12 MB\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vai al cestino" })).toHaveAttribute(
      "href",
      "/galleria?view=cestino",
    );
  });

  it("omits the trash line entirely while the summary has not loaded yet", () => {
    renderDiskCard({ disk: { free_gb: 40, min_free_gb: 10 } });

    expect(screen.queryByText(/Cestino:/)).not.toBeInTheDocument();
  });
});
