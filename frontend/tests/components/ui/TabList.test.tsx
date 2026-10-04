import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabList } from "@/components/ui/TabList";

const ITEMS = [
  { id: "a", label: "Primo" },
  { id: "b", label: "Secondo" },
  { id: "c", label: "Terzo" },
];

function Harness() {
  const [selected, setSelected] = useState("a");
  return <TabList label="Viste" items={ITEMS} selected={selected} onSelect={setSelected} />;
}

describe("TabList keyboard (WAI-ARIA tabs)", () => {
  it("moves selection and focus with the arrow keys, wrapping at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Primo" }));

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Secondo" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Secondo" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Primo" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Terzo" })).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Primo" }));

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Terzo" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Primo" })).toHaveFocus();
  });

  it("keeps only the selected tab in the Tab order", () => {
    render(<Harness />);

    expect(screen.getByRole("tab", { name: "Primo" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Secondo" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tablist", { name: "Viste" })).toBeInTheDocument();
  });
});
