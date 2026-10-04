import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeCard } from "@/components/settings/ThemeCard";

describe("ThemeCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("starts with Scuro checked, since dark is the default theme", () => {
    render(<ThemeCard />);

    expect(screen.getByRole("radio", { name: "Scuro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Chiaro" })).toHaveAttribute("aria-checked", "false");
  });

  it("switches the checked option when picking the other theme", async () => {
    render(<ThemeCard />);

    await userEvent.click(screen.getByRole("radio", { name: "Chiaro" }));

    expect(screen.getByRole("radio", { name: "Chiaro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Scuro" })).toHaveAttribute("aria-checked", "false");
  });

  it("stays on the same theme when clicking the option that is already active", async () => {
    render(<ThemeCard />);

    await userEvent.click(screen.getByRole("radio", { name: "Scuro" }));

    expect(screen.getByRole("radio", { name: "Scuro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Chiaro" })).toHaveAttribute("aria-checked", "false");
  });
});
