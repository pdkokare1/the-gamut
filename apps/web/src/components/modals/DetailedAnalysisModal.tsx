import React from 'react';
import { 
  X, ShieldAlert, TrendingUp, CheckCircle2, 
  AlertTriangle,  Users, Building2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { type RouterOutputs } from '@/utils/trpc';

type Article = RouterOutputs['article']['getById'];

interface DetailedAnalysisModalProps {
  article: Article | null;
  onClose: () => void;
}

export const DetailedAnalysisModal: React.FC<DetailedAnalysisModalProps> = ({ article, onClose }) => {
  if (!article) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Helper to get color based on bias score (0-100)
  const getBiasColor = (score: number) => {
    if (score < 30) return 'bg-green-500'; // Low bias
    if (score < 70) return 'bg-yellow-500'; // Moderate
    return 'bg-red-500'; // High bias
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={handleOverlayClick}
    >
      <div 
        className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-muted/20">
          <div>
            <h2 className="text-xl font-heading font-semibold">Narrative Analysis</h2>
            <p className="text-sm text-muted-foreground mt-1">
              AI-driven breakdown of bias, sentiment, and credibility.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8">
            
            {/* 1. Scores Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Credibility Grade */}
              <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col items-center justify-center text-center">
                 <div className="text-4xl font-black text-primary mb-2">{article.credibilityGrade || 'B+'}</div>
                 <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Credibility Grade</div>
              </div>

              {/* Bias Meter */}
              <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col justify-center">
                 <div className="flex justify-between text-sm font-medium mb-2">
                    <span>Bias Score</span>
                    <span>{article.biasScore}/100</span>
                 </div>
                 <Progress value={article.biasScore} className="h-3" indicatorClassName={getBiasColor(article.biasScore)} />
                 <p className="text-xs text-muted-foreground mt-2 text-center">
                    {article.biasScore < 30 ? 'Minimal Bias Detected' : article.biasScore < 70 ? 'Moderate Editorializing' : 'Strong Opinion / Bias'}
                 </p>
              </div>

              {/* Sentiment */}
              <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col items-center justify-center text-center">
                 {article.sentiment === 'Positive' && <TrendingUp className="h-8 w-8 text-green-500 mb-2" />}
                 {article.sentiment === 'Negative' && <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />}
                 {article.sentiment === 'Neutral' && <ShieldAlert className="h-8 w-8 text-yellow-500 mb-2" />}
                 <div className="font-bold text-lg">{article.sentiment}</div>
                 <div className="text-xs text-muted-foreground uppercase">Overall Tone</div>
              </div>
            </div>

            <Separator />

            {/* 2. Key Entities (People & Orgs) */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Users className="h-4 w-4" /> Detected Entities
              </h3>
              <div className="flex flex-wrap gap-2">
                {/* @ts-ignore - Assuming entities is stored as JSON array */}
                {(article.entities || []).map((entity: string, i: number) => (
                  <Badge key={i} variant="outline" className="px-3 py-1 text-sm bg-background">
                    {entity}
                  </Badge>
                ))}
                {(!article.entities || (article.entities as any[]).length === 0) && (
                   <span className="text-sm text-muted-foreground">No specific entities detected.</span>
                )}
              </div>
            </div>

            <Separator />

            {/* 3. Fact Checks / Claims */}
            <div>
               <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Fact Check Database
              </h3>
               <div className="space-y-3">
                  {/* @ts-ignore - Assuming factChecks is stored as JSON */}
                  {(article.factChecks || []).map((fact: any, i: number) => (
                    <div key={i} className="flex gap-3 bg-muted/30 p-3 rounded-md border border-border/50">
                        <div className={`mt-0.5 shrink-0 ${fact.verdict === 'True' ? 'text-green-500' : 'text-orange-500'}`}>
                           {fact.verdict === 'True' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                        </div>
                        <div>
                           <p className="text-sm font-medium leading-snug">{fact.claim}</p>
                           <p className="text-xs text-muted-foreground mt-1">Verdict: <span className="font-bold">{fact.verdict}</span></p>
                        </div>
                    </div>
                  ))}
                  {(!article.factChecks || (article.factChecks as any[]).length === 0) && (
                     <p className="text-sm text-muted-foreground italic">No disputed claims found in our database for this article.</p>
                  )}
               </div>
            </div>

          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
