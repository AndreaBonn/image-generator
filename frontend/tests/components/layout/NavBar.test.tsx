import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";

function renderNavBar(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavBar />
    </MemoryRouter>,
  );
}

describe("NavBar", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("links every nav item to its route", () => {
    renderNavBar();

    expect(screen.getByRole("link", { name: "Crea" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Modifica" })).toHaveAttribute("href", "/modifica");
    expect(screen.getByRole("link", { name: "Migliora" })).toHaveAttribute("href", "/migliora");
    expect(screen.getByRole("link", { name: "Galleria" })).toHaveAttribute("href", "/galleria");
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute(
      "href",
      "/impostazioni",
    );
  });

  it("gives every nav item a decorative icon, keeping the text as its name (S5)", () => {
    renderNavBar();

    for (const name of ["Crea", "Modifica", "Migliora", "Galleria", "Impostazioni"]) {
      const icon = screen.getByRole("link", { name }).querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("lays the five items out as an evenly split row on phones instead of a scroller (S5)", () => {
    renderNavBar();

    const list = screen.getByRole("list");
    expect(list).toHaveClass("grid", "grid-cols-5");
    expect(list).not.toHaveClass("overflow-x-auto");
  });

  it("links to the guide from every page (N3)", () => {
    renderNavBar();

    expect(screen.getByRole("link", { name: "Come funziona" })).toHaveAttribute("href", "/guida");
  });

  it("marks only the link matching the current route as active", () => {
    renderNavBar("/modifica");

    expect(screen.getByRole("link", { name: "Modifica" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Crea" })).not.toHaveAttribute("aria-current");
  });

  it("starts in dark mode, offering to switch to the light theme", () => {
    renderNavBar();

    const toggle = screen.getByRole("button", { name: "Passa al tema chiaro" });
    expect(toggle).toHaveTextContent("Tema chiaro");
  });

  it("switches to offering the dark theme after the toggle is clicked", async () => {
    renderNavBar();

    const toggle = screen.getByRole("button", { name: "Passa al tema chiaro" });
    await userEvent.click(toggle);

    const switchedToggle = screen.getByRole("button", { name: "Passa al tema scuro" });
    expect(switchedToggle).toHaveTextContent("Tema scuro");
  });
});
