import React, { useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSwipeable } from 'react-swipeable'; // Suggested addition for cleaner swipe
import { Lock, Newspaper, Layers, Scale } from 'lucide-react';

import FeedList from './FeedList';
import InFocusBar from './InFocusBar';
import { LoginModal } from '@/components/modals/LoginModal';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/use-is-mobile'; // Shadcn hook or custom
import { useHaptic } from '@/hooks/use-haptic';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Types
export interface IFilters {
    category?: string;
    politicalLean?: string;
}

interface NewsFeedProps {
    filters: IFilters;
    onFilterChange: (f: IFilters) => void;
}

type FeedMode = 'latest' | 'infocus' | 'balanced';

const NewsFeed: React.FC<NewsFeedProps> = ({ filters, onFilterChange }) => {
    const [mode, setMode] = useState<FeedMode>('latest');
    const [showLoginModal, setShowLoginModal] = useState(false);
    
    // Hooks
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const { vibrate } = useHaptic(); // Assuming useHaptic returns object or function

    // --- MODE SWITCHING ---
    const handleModeChange = (newMode: string) => {
        vibrate();
        
        // Guest Protection for Balanced Mode
        if (!user && newMode === 'balanced') {
            setShowLoginModal(true);
            return;
        }
        
        setMode(newMode as FeedMode);
    };

    // --- SWIPE HANDLERS ---
    const swipeHandlers = useSwipeable({
        onSwipedLeft: () => {
            if (mode === 'latest') handleModeChange('infocus');
            else if (mode === 'infocus') handleModeChange('balanced');
        },
        onSwipedRight: () => {
            if (mode === 'balanced') handleModeChange('infocus');
            else if (mode === 'infocus') handleModeChange('latest');
        },
        trackMouse: false
    });

    const getPageTitle = () => {
        switch(mode) {
            case 'balanced': return 'Balanced Perspectives | The Gamut';
            case 'infocus': return 'Narratives | The Gamut';
            default: return 'The Gamut - Full Spectrum News';
        }
    };

    return (
        <main className="min-h-screen bg-background" {...swipeHandlers}>
            <Helmet><title>{getPageTitle()}</title></Helmet>

            {/* --- 1. TABS NAVIGATION --- */}
            <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
                <div className="max-w-3xl mx-auto">
                    <Tabs value={mode} onValueChange={handleModeChange} className="w-full">
                        <TabsList className="w-full grid grid-cols-3 h-14 bg-transparent p-0">
                            
                            <TabsTrigger 
                                value="latest" 
                                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full gap-2 transition-all"
                            >
                                <Newspaper className="w-4 h-4" />
                                <span className={cn(isMobile ? "text-xs" : "text-sm")}>Latest</span>
                            </TabsTrigger>

                            <TabsTrigger 
                                value="infocus" 
                                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full gap-2 transition-all"
                            >
                                <Layers className="w-4 h-4" />
                                <span className={cn(isMobile ? "text-xs" : "text-sm")}>Narratives</span>
                            </TabsTrigger>

                            <TabsTrigger 
                                value="balanced" 
                                className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full gap-2 transition-all relative"
                            >
                                <Scale className="w-4 h-4" />
                                <span className={cn(isMobile ? "text-xs" : "text-sm")}>Balanced</span>
                                
                                {/* Lock Icon for Guests */}
                                {!user && (
                                    <Lock className="w-3 h-3 text-muted-foreground ml-1 absolute top-2 right-2 sm:static" />
                                )}
                            </TabsTrigger>

                        </TabsList>
                    </Tabs>
                </div>
            </div>

            {/* --- 2. SUB-NAVIGATION (In Focus Bar) --- */}
            <InFocusBar 
                activeTopic={filters.category} // Using category filter as topic for now
                onTopicClick={(topic) => onFilterChange({ ...filters, category: topic })} 
            />

            {/* --- 3. MAIN CONTENT --- */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <FeedList 
                    mode={mode} 
                    filters={filters}
                    onOpenNarrative={(n) => console.log("Open Narrative Modal", n)} 
                />
            </div>

            {/* --- MODALS --- */}
            <LoginModal 
                isOpen={showLoginModal} 
                onClose={() => setShowLoginModal(false)}
            />
        </main>
    );
};

export default NewsFeed;
