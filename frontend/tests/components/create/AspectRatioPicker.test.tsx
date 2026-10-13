import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AspectRatioPicker } from "@/components/create/AspectRatioPicker";
import type { AspectRatio } from "@/api/types";

const featuredRatio: AspectRatio = {
  value: "1152*896",
  width: 1152,
  height: 896,
  label: "Orizzontale 4:3 · 1152×896",
  featured: true,
};
const otherRatio: AspectRatio = {
  value: "1920*1080",
  width: 1920,
  height: 1080,
  label: "Panoramico 16:9 · 1920×1080",
  featured: false,
};

describe("AspectRatioPicker", () => {
  it("explains the field in plain text instead of a ? button (S3)", () => {
    render(<AspectRatioPicker ratios={[featuredRatio]} value={featuredRatio.value} onChange={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Proporzioni" })).toHaveAccessibleDescription(
      "La forma dell'immagine finale.",
    );
    expect(screen.queryByRole("button", { name: /^Informazioni/ })).not.toBeInTheDocument();
  });

  it("shows only the featured ratios up front (SPEC.md § 3.4)", () => {
    render(
      <AspectRatioPicker ratios={[featuredRatio, otherRatio]} value={featuredRatio.value} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: featuredRatio.label })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: otherRatio.label })).not.toBeInTheDocument();
  });

  it("marks the selected ratio with aria-pressed, others as not pressed", () => {
    render(
      <AspectRatioPicker ratios={[featuredRatio, otherRatio]} value={featuredRatio.value} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: featuredRatio.label })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the 'Altri formati' toggle when every ratio is featured", () => {
    render(<AspectRatioPicker ratios={[featuredRatio]} value={featuredRatio.value} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Altri formati/ })).not.toBeInTheDocument();
  });

  it("reveals the non-featured ratios under 'Altri formati' on click, and can hide them again", async () => {
    render(
      <AspectRatioPicker ratios={[featuredRatio, otherRatio]} value={featuredRatio.value} onChange={vi.fn()} />,
    );

    const toggle = screen.getByRole("button", { name: "Altri formati" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: otherRatio.label })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Nascondi altri formati" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: otherRatio.label })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Nascondi altri formati" }));
    expect(screen.queryByRole("button", { name: otherRatio.label })).not.toBeInTheDocument();
  });

  it("calls onChange with the ratio value when a featured ratio is clicked", async () => {
    const onChange = vi.fn();
    render(
      <AspectRatioPicker ratios={[featuredRatio, otherRatio]} value={otherRatio.value} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: featuredRatio.label }));
    expect(onChange).toHaveBeenCalledWith(featuredRatio.value);
  });

  it("calls onChange with the ratio value when a non-featured ratio is clicked", async () => {
    const onChange = vi.fn();
    render(
      <AspectRatioPicker ratios={[featuredRatio, otherRatio]} value={featuredRatio.value} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Altri formati" }));
    await userEvent.click(screen.getByRole("button", { name: otherRatio.label }));
    expect(onChange).toHaveBeenCalledWith(otherRatio.value);
  });
});
