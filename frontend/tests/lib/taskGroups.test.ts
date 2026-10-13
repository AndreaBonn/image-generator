import { describe, expect, it } from "vitest";
import { groupTasksBySource, italianFriendlyTask, languageTag } from "@/lib/taskGroups";
import { buildTask } from "../fixtures/task";

describe("groupTasksBySource (C3)", () => {
  it("puts tasks that need the user's images in their own group, keeping order", () => {
    const tasks = [
      buildTask({ id: "bozza", min_references: 0 }),
      buildTask({ id: "da_schizzo", min_references: 1 }),
      buildTask({ id: "foto", min_references: 0 }),
      buildTask({ id: "in_posa", min_references: 2 }),
    ];

    const groups = groupTasksBySource(tasks);

    expect(groups.map((group) => group.label)).toEqual(["Da una descrizione", "Partendo da tue immagini"]);
    expect(groups[0]?.tasks.map((task) => task.id)).toEqual(["bozza", "foto"]);
    expect(groups[1]?.tasks.map((task) => task.id)).toEqual(["da_schizzo", "in_posa"]);
  });

  it("drops a group with no tasks", () => {
    const groups = groupTasksBySource([buildTask({ id: "bozza", min_references: 0 })]);

    expect(groups.map((group) => group.label)).toEqual(["Da una descrizione"]);
  });

  it("returns no groups for an empty catalog", () => {
    expect(groupTasksBySource([])).toEqual([]);
  });
});

describe("italianFriendlyTask (C7)", () => {
  const italian = { required: "any" as const, label: "Italiano o inglese", reason: "Capisce entrambe." };

  it("picks the first available text-only task that understands Italian", () => {
    const tasks = [
      buildTask({ id: "bozza" }),
      buildTask({ id: "in_posa", min_references: 2, prompt_language: italian }),
      buildTask({ id: "testo", available: false, prompt_language: italian }),
      buildTask({ id: "foto", prompt_language: italian }),
    ];

    expect(italianFriendlyTask(tasks)?.id).toBe("foto");
  });

  it("returns undefined when no task fits", () => {
    expect(italianFriendlyTask([buildTask({ id: "bozza" })])).toBeUndefined();
  });
});

describe("languageTag (R5)", () => {
  it.each([
    ["en", "in inglese"],
    ["it", "in italiano"],
    ["any", "anche in italiano"],
  ] as const)("says %s as %s", (required, tag) => {
    expect(languageTag(required)).toBe(tag);
  });
});
