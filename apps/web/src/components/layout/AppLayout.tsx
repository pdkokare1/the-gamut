import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { GlobalAudioPlayer } from '@/components/GlobalAudioPlayer';

// Modals
import SmartBriefingModal from '@/components/modals/SmartBriefingModal';
import { DetailedAnalysisModal } from '@/components/modals/DetailedAnalysisModal';
import { CompareCoverageModal } from '@/components/modals/CompareCoverageModal';
import { useUI } from '@/context/UIContext';

export function AppLayout() {
  // Use our new UI Context to check if modals should be open
  const { activeModal, modalData, closeModals, openCompare, showTooltip } = useUI();

  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary/20 flex flex-col">
      {/* 1. Header */}
      <Header />

      {/* 2. Main Content */}
      <main className="flex-1 container mx-auto px-4 pt-4 pb-24 md:pb-28 max-w-7xl animate-in fade-in duration-500">
        <Outlet />
      </main>

      {/* 3. Global Audio Player (Persists across pages) */}
      <GlobalAudioPlayer />

      {/* 4. Mobile Navigation */}
      <div className="md:hidden">
        <BottomNav />
      </div>

      {/* 5. Global Modals Manager */}
      {/* This replaces the individual modal state in MainLayout */}
      
      {activeModal === 'smart-briefing' && modalData && (
        <SmartBriefingModal
          article={modalData}
          onClose={closeModals}
          onCompare={(a) => openCompare(a.clusterId || 0, a.headline)}
          showTooltip={showTooltip}
        />
      )}

      {activeModal === 'analysis' && modalData && (
        <DetailedAnalysisModal
          article={modalData}
          onClose={closeModals}
        />
      )}

      {activeModal === 'compare' && modalData && (
        <CompareCoverageModal
          clusterId={modalData.clusterId}
          articleTitle={modalData.articleTitle}
          onClose={closeModals}
          onAnalyze={() => { /* Switch to analysis if needed */ }}
          showTooltip={showTooltip}
        />
      )}

    </div>
  );
}
