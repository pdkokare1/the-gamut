import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { ProfilePage } from "./pages/ProfilePage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { NarrativePage } from "./pages/NarrativePage";
import { SettingsPage } from "./pages/SettingsPage"; // New Import

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} /> {/* New Route */}
          <Route path="/saved" element={<ProfilePage />} />
          
          <Route path="/emergency" element={<EmergencyPage />} />
          <Route path="/narrative/:id" element={<NarrativePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
