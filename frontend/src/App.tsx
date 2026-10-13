import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { CreatePage } from "@/pages/CreatePage";
import { EditPage } from "@/pages/EditPage";
import { ImprovePage } from "@/pages/ImprovePage";
import { GalleryPage } from "@/pages/GalleryPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { GuidePage } from "@/pages/GuidePage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CreatePage />} />
        <Route path="modifica" element={<EditPage />} />
        <Route path="migliora" element={<ImprovePage />} />
        <Route path="galleria" element={<GalleryPage />} />
        <Route path="impostazioni" element={<SettingsPage />} />
        <Route path="guida" element={<GuidePage />} />
      </Route>
    </Routes>
  );
}
