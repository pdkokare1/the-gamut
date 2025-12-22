import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of our Global UI State
interface UIContextType {
  // Modal State
  activeModal: 'none' | 'smart-briefing' | 'analysis' | 'compare';
  modalData: any | null;
  
  // Actions
  openSmartBriefing: (article: any) => void;
  openAnalysis: (article: any) => void;
  openCompare: (clusterId: number, articleTitle: string) => void;
  closeModals: () => void;

  // Global Tooltip (Optional, can be handled by UI lib, but keeping for parity)
  tooltip: { visible: boolean; text: string; x: number; y: number };
  showTooltip: (text: string, e: React.MouseEvent) => void;
  hideTooltip: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<UIContextType['activeModal']>('none');
  const [modalData, setModalData] = useState<any>(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  const openSmartBriefing = (article: any) => {
    setModalData(article);
    setActiveModal('smart-briefing');
  };

  const openAnalysis = (article: any) => {
    setModalData(article);
    setActiveModal('analysis');
  };

  const openCompare = (clusterId: number, articleTitle: string) => {
    setModalData({ clusterId, articleTitle });
    setActiveModal('compare');
  };

  const closeModals = () => {
    setActiveModal('none');
    setModalData(null);
  };

  const showTooltip = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltip({ visible: true, text, x: e.clientX, y: e.clientY });
  };

  const hideTooltip = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  return (
    <UIContext.Provider value={{
      activeModal,
      modalData,
      openSmartBriefing,
      openAnalysis,
      openCompare,
      closeModals,
      tooltip,
      showTooltip,
      hideTooltip
    }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
