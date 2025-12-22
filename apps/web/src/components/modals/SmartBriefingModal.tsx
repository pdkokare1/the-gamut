import React from 'react';
import { X, ExternalLink, ShieldAlert, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type RouterOutputs } from '@/utils/trpc';

// Infer Article type from your TRPC Router to ensure strict type safety
type Article = RouterOutputs['article']['getById'];

interface SmartBriefingModalProps {
  article: Article | null;
  onClose: () => void;
  onCompare: (article: Article) => void;
  showTooltip: (text: string, e: React.MouseEvent) => void;
}

const SmartBriefingModal: React.FC<SmartBriefingModalProps> = ({ article, onClose, onCompare, showTooltip }) => {
  if (!article) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isReview = article.analysisType === 'SentimentOnly';

  return (
    // OPTIMIZATION: Replaced .smart-brief-overlay with Tailwind backdrop utilities
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4" 
      onClick={handleOverlayClick}
    >
      {/* Modal Content */}
      <div 
        className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200" 
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* --- Header --- */}
        <div className="flex justify-between items-start p-6 pb-2 border-b-0">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Smart Briefing</span>
            <h2 className="text-2xl font-heading font-semibold leading-tight text-foreground">
              {article.headline}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* --- Body --- */}
        <div className="p-6 pt-2 overflow-y-auto custom-scrollbar">
          
          {/* Metadata Bar */}
          <div className="flex flex-wrap gap-3 items-center text-[11px] text-muted-foreground uppercase tracking-wide mb-6 pb-4 border-b border-border">
            <span className="font-bold text-primary">{article.source}</span>
            <span>•</span>
            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
            {!isReview && (
              <>
                <span>•</span>
                <Badge 
                  variant="outline" 
                  className="cursor-help hover:bg-muted font-normal"
                  onClick={(e) => showTooltip("Bias Score (0-100). Lower is better.", e)}
                >
                  <ShieldAlert className="w-3 h-3 mr-1" /> Bias {article.biasScore}
                </Badge>
                
                <Badge 
                  variant="outline" 
                  className="cursor-help hover:bg-muted font-normal"
                  onClick={(e) => showTooltip("Credibility Grade based on facts and sources.", e)}
                >
                  <BadgeCheck className="w-3 h-3 mr-1" /> Grade {article.credibilityGrade}
                </Badge>
              </>
            )}
          </div>

          {/* AI Summary */}
          <div className="mb-6 space-y-3">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Executive Summary</h3>
            <p className="text-sm md:text-base leading-relaxed text-foreground/90 font-serif">
              {article.summary}
            </p>
          </div>

          {/* Key Findings */}
          {article.keyFindings && article.keyFindings.length > 0 && (
            <div className="pl-5 border-l-2 border-primary/50 mt-6 space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Key Findings</h3>
              <ul className="space-y-3">
                {article.keyFindings.map((finding: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/80">
                    <span className="text-primary font-mono text-xs pt-1">0{i+1}</span>
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* --- Footer Actions --- */}
        <div className="p-5 bg-muted/30 border-t border-border flex flex-col sm:flex-row justify-between gap-3">
            <Button variant="outline" className="w-full sm:w-auto" asChild>
                <a href={article.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Read Original
                </a>
            </Button>
            
            <Button 
                className="w-full sm:w-auto" 
                onClick={() => { onClose(); onCompare(article); }}
            >
                Compare Coverage ({article.clusterCount || 1})
            </Button>
        </div>
      </div>
    </div>
  );
};

export default SmartBriefingModal;
