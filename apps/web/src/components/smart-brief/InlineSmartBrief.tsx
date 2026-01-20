// apps/web/src/components/smart-brief/InlineSmartBrief.tsx
import React from 'react';
import { trpc } from '@/utils/trpc';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { LoginModal } from '@/components/modals/LoginModal';

interface InlineSmartBriefProps {
  articleId: string;
}

export const InlineSmartBrief: React.FC<InlineSmartBriefProps> = ({ articleId }) => {
  const { isGuest } = useAuth();
  const [showLogin, setShowLogin] = React.useState(false);

  // Use tRPC to fetch the brief
  const { data, isLoading, isError } = trpc.article.smartBriefing.useQuery(
    { articleId },
    { 
        enabled: !isGuest, // Don't fetch if guest
        staleTime: Infinity 
    }
  );

  // 1. Guest View (Locked Tease)
  if (isGuest) {
    return (
      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-dashed relative overflow-hidden">
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
            <Button variant="secondary" size="sm" onClick={() => setShowLogin(true)} className="gap-2">
                <Lock className="w-3 h-3" />
                Unlock AI Analysis
            </Button>
        </div>
        {/* Fake blurred content behind */}
        <div className="opacity-40 blur-sm select-none">
            <h4 className="font-semibold mb-2">Key Takeaways</h4>
            <ul className="space-y-2 text-sm">
                <li>• This is a hidden summary point that...</li>
                <li>• requires a login to view the full...</li>
                <li>• analysis of the situation...</li>
            </ul>
        </div>
        <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      </div>
    );
  }

  // 2. Loading State
  if (isLoading) {
    return (
      <div className="mt-4 p-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-lg animate-pulse">
         <Loader2 className="w-5 h-5 animate-spin mb-2" />
         <span className="text-xs">Generating Brief...</span>
      </div>
    );
  }

  // 3. Error State
  if (isError) {
    return (
      <div className="mt-4 p-4 flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg text-sm">
         <AlertCircle className="w-4 h-4" />
         <span>Unable to load briefing.</span>
      </div>
    );
  }

  // 4. Content State
  return (
    <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/10 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-primary/10">
        <span className="text-lg">✨</span>
        <h4 className="font-semibold text-sm text-foreground">Smart Brief</h4>
      </div>
      
      <ul className="space-y-3">
        {data?.keyPoints?.map((point: string, i: number) => (
          <li key={i} className="text-sm leading-relaxed text-muted-foreground flex gap-2">
            <span className="text-primary mt-1">•</span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
};
