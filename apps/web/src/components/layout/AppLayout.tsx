import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header"; // Assumes you have this from previous steps
import { AudioProvider } from "../../context/AudioContext"; // New
import { GlobalAudioPlayer } from "../GlobalAudioPlayer"; // New

export function AppLayout() {
  return (
    <AudioProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24 md:pb-0">
        <Header />
        
        <main className="pt-16 md:pt-20 max-w-7xl mx-auto min-h-[85vh]">
          <Outlet />
        </main>
        
        {/* Global Player sits above bottom nav on mobile */}
        <GlobalAudioPlayer />

        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </AudioProvider>
  );
}
