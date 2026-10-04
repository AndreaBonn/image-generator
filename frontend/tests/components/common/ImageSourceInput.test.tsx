import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageSourceInput } from "@/components/common/ImageSourceInput";

function makeImageFile(name = "photo.png", type = "image/png") {
  return new File(["fake-bytes"], name, { type });
}

describe("ImageSourceInput", () => {
  it("does not show an error when uploadError is false", () => {
    render(
      <ImageSourceInput isUploading={false} uploadError={false} onFileSelected={vi.fn()} />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the Italian upload error when uploadError is true", () => {
    render(<ImageSourceInput isUploading={false} uploadError={true} onFileSelected={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossibile caricare l'immagine. Verifica formato e dimensione.",
    );
  });

  it("calls onFileSelected with the chosen file", async () => {
    const onFileSelected = vi.fn();
    render(<ImageSourceInput isUploading={false} uploadError={false} onFileSelected={onFileSelected} />);

    const file = makeImageFile();
    const input = screen.getByLabelText("Scegli un'immagine da modificare", { exact: false });
    await userEvent.upload(input, file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("disables the picker while uploading", () => {
    render(<ImageSourceInput isUploading={true} uploadError={false} onFileSelected={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Scegli un file" })).toBeDisabled();
  });

  it("disables the picker when disabled is explicitly true", () => {
    render(
      <ImageSourceInput isUploading={false} uploadError={false} disabled onFileSelected={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Scegli un file" })).toBeDisabled();
  });

  it("uses the custom inputLabel when provided", () => {
    render(
      <ImageSourceInput
        isUploading={false}
        uploadError={false}
        inputLabel="Scegli l'immagine da migliorare"
        onFileSelected={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Scegli l'immagine da migliorare")).toBeInTheDocument();
  });
});
