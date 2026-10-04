import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageInput } from "@/components/edit/ImageInput";

function dropZone() {
  // The dropzone is the outer div; "Trascina un'immagine..." is its only
  // direct text, so climbing from it reaches the element with onDrop/onDragOver.
  return screen.getByText("Trascina un'immagine qui, oppure").parentElement as HTMLElement;
}

function dataTransferWith(file: File | null) {
  return { files: file ? [file] : [] } as unknown as DataTransfer;
}

describe("ImageInput", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the hidden file picker when 'Scegli un file' is clicked", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<ImageInput onFileSelected={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Scegli un file" }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("does not open the file picker when disabled", async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<ImageInput onFileSelected={vi.fn()} disabled />);

    await userEvent.click(screen.getByRole("button", { name: "Scegli un file" }));

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("prevents the default browser action on dragover", () => {
    render(<ImageInput onFileSelected={vi.fn()} />);

    const result = fireEvent.dragOver(dropZone());

    expect(result).toBe(false);
  });

  it("accepts a valid dropped image and calls onFileSelected", () => {
    const onFileSelected = vi.fn();
    render(<ImageInput onFileSelected={onFileSelected} />);
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    fireEvent.drop(dropZone(), { dataTransfer: dataTransferWith(file) });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("ignores a dropped file of an unsupported type", () => {
    const onFileSelected = vi.fn();
    render(<ImageInput onFileSelected={onFileSelected} />);
    const file = new File(["bytes"], "notes.txt", { type: "text/plain" });

    fireEvent.drop(dropZone(), { dataTransfer: dataTransferWith(file) });

    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("ignores a dropped file entirely when disabled", () => {
    const onFileSelected = vi.fn();
    render(<ImageInput onFileSelected={onFileSelected} disabled />);
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    fireEvent.drop(dropZone(), { dataTransfer: dataTransferWith(file) });

    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("uses the custom input label when provided", () => {
    render(<ImageInput onFileSelected={vi.fn()} inputLabel="Scegli un'immagine da migliorare" />);

    expect(screen.getByLabelText("Scegli un'immagine da migliorare")).toBeInTheDocument();
  });
});
