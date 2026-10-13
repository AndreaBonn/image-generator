import { TabList, type TabItem } from "@/components/ui/TabList";
import type { EditMode } from "@/lib/editMode";

export type { EditMode };

const TABS: TabItem<EditMode>[] = [
  { id: "modifica_libera", label: "Modifica con le parole" },
  { id: "inpaint", label: "Modifica una parte" },
  { id: "outpaint", label: "Allarga l'immagine" },
];

interface EditModeTabsProps {
  mode: EditMode;
  onSelect: (mode: EditMode) => void;
}

/**
 * Tab bar for the three Modifica modes (F2). "Modifica con le parole" is
 * first because it needs no drawing skill, so a first-time user sees the
 * simplest option before opening the mask editor.
 */
export function EditModeTabs({ mode, onSelect }: EditModeTabsProps) {
  return <TabList label="Modalità di modifica" items={TABS} selected={mode} onSelect={onSelect} />;
}
