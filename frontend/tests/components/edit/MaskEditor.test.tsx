import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaskEditor } from "@/components/edit/MaskEditor";

const WIDTH = 200;
const HEIGHT = 150;

function canvas() {
  const node = document.querySelector("canvas");
  if (!node) throw new Error("mask canvas not found");
  return node;
}

/** jsdom has no ImageData constructor either; a plain data holder is enough
 * since nothing in these tests reads back the pixels it wraps. */
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

describe("MaskEditor", () => {
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;
  let putImageData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // jsdom has no canvas backend (no "canvas" npm package): getContext would
    // throw "not implemented" and every ctx-dependent branch would be
    // permanently dead. Stub the 2D context and ImageData at this boundary,
    // the same way the project mocks fetch/EventSource elsewhere, so
    // redraw() and the paint-on-mount effect actually run.
    vi.stubGlobal("ImageData", FakeImageData);
    putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);

    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: WIDTH,
          height: HEIGHT,
          top: 0,
          left: 0,
          right: WIDTH,
          bottom: HEIGHT,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: canvas(), coords: { clientX: from.x, clientY: from.y } },
      { target: canvas(), coords: { clientX: to.x, clientY: to.y } },
      { keys: "[/MouseLeft]", target: canvas() },
    ]);
  }

  it("tells the user to paint the area to change until the first stroke (M4)", async () => {
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={vi.fn()} />);

    expect(screen.getByText("Colora con il pennello la zona da cambiare")).toBeInTheDocument();

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    expect(screen.queryByText("Colora con il pennello la zona da cambiare")).not.toBeInTheDocument();
  });

  it("reports an empty mask on mount and paints the overlay via the 2D context", () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);

    expect(onMaskChange).toHaveBeenCalledTimes(1);
    const mask = onMaskChange.mock.calls[0]?.[0] as Uint8Array;
    expect(mask.every((value) => value === 0)).toBe(true);
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it("paints a non-empty mask while dragging and commits one history step on release", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    const lastMask = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(lastMask.some((value) => value === 255)).toBe(true);
    // redraw() runs on every pointermove plus once on commit's history push.
    expect(putImageData.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Annulla" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ripeti" })).toBeDisabled();
  });

  it("erases with the Gomma tool instead of painting", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    onMaskChange.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Gomma" }));
    expect(screen.getByRole("button", { name: "Gomma" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pennello" })).toHaveAttribute("aria-pressed", "false");

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    const lastMask = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(lastMask.every((value) => value === 0)).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Pennello" }));
    expect(screen.getByRole("button", { name: "Pennello" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gomma" })).toHaveAttribute("aria-pressed", "false");

    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    const paintedAgain = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(paintedAgain.some((value) => value === 255)).toBe(true);
  });

  it("undoes and redoes a stroke", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    const afterUndo = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(afterUndo.every((value) => value === 0)).toBe(true);
    expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ripeti" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Ripeti" }));
    const afterRedo = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(afterRedo.some((value) => value === 255)).toBe(true);
  });

  it("inverts the mask", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });
    const painted = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    const paintedCount = painted.filter((value) => value === 255).length;

    await userEvent.click(screen.getByRole("button", { name: "Inverti" }));

    const inverted = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(inverted.filter((value) => value === 255).length).toBe(painted.length - paintedCount);
  });

  it("clears the mask back to empty", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    await userEvent.click(screen.getByRole("button", { name: "Cancella tutto" }));

    const cleared = onMaskChange.mock.calls.at(-1)?.[0] as Uint8Array;
    expect(cleared.every((value) => value === 0)).toBe(true);
  });

  it("does nothing when the pointer leaves the canvas without ever pressing down", async () => {
    const onMaskChange = vi.fn();
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={onMaskChange} />);
    onMaskChange.mockClear();

    fireEvent.pointerLeave(canvas());
    const callsAfterLeave = onMaskChange.mock.calls.length;
    await drag({ x: 50, y: 50 }, { x: 120, y: 50 });

    expect({ callsAfterLeave, callsAfterDrag: onMaskChange.mock.calls.length > 0 }).toEqual({
      callsAfterLeave: 0,
      callsAfterDrag: true,
    });
  });

  it("changes the brush size via the slider", async () => {
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={vi.fn()} />);
    const slider = screen.getByLabelText("Dimensione del pennello");

    fireEvent.change(slider, { target: { value: "120" } });

    expect(slider).toHaveValue("120");
  });

  it("switches between fit and 100% zoom, resizing the viewport container", async () => {
    render(<MaskEditor imageUrl="/src.png" width={WIDTH} height={HEIGHT} onMaskChange={vi.fn()} />);
    const viewport = canvas().parentElement as HTMLElement;
    expect(viewport.style.width).toBe("100%");

    await userEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(viewport.style.width).toBe(`${WIDTH}px`);
    expect(screen.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Adatta" }));
    expect(viewport.style.width).toBe("100%");
    expect(screen.getByRole("button", { name: "Adatta" })).toHaveAttribute("aria-pressed", "true");
  });
});
