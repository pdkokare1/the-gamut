import { trpc } from '../../utils/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { BrainCircuit, CheckCircle2, AlertTriangle, Quote } from 'lucide-react';
import { Badge } from '../ui/badge';
import { BiasChart } from '../visualizations/BiasChart';

interface SmartBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleId: string;
}

export function SmartBriefingModal({ isOpen, onClose, articleId }: SmartBriefingModalProps) {
  const { data: brief, isLoading } = trpc.article.getSmartBriefing.useQuery(
    { articleId }, 
    { enabled: isOpen }
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
        <div className="p-6 pb-2 border-b bg-muted/10">
            <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-logo">
                <BrainCircuit className="w-6 h-6 text-purple-600" />
                Smart Brief
            </DialogTitle>
            </DialogHeader>
        </div>

        <ScrollArea className="flex-1 p-6">
            {isLoading ? (
                 <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                    <div className="h-32 bg-muted rounded w-full mt-6" />
                 </div>
            ) : brief ? (
                <div className="space-y-8">
                    
                    {/* 1. Executive Summary */}
                    <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                            <Quote className="w-3 h-3" /> TL;DR
                        </h3>
                        <p className="text-sm leading-relaxed text-foreground/90 font-medium">
                            {brief.content}
                        </p>
                    </div>

                    {/* 2. Key Findings Grid */}
                    <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                            Key Findings
                        </h3>
                        <ul className="space-y-2">
                            {brief.keyPoints.map((point: string, i: number) => (
                                <li key={i} className="flex gap-3 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    <span>{point}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* 3. Bias & Trust Analysis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-card border rounded-xl p-4 shadow-sm">
                        
                        {/* Trust Score */}
                        <div className="space-y-2 text-center border-r-0 md:border-r border-dashed pr-0 md:pr-6">
                            <div className="text-xs font-bold text-muted-foreground uppercase">Trust Score</div>
                            <div className="relative inline-flex items-center justify-center">
                                <span className={`text-4xl font-black ${
                                    brief.meta.trustScore > 80 ? 'text-green-600' : 
                                    brief.meta.trustScore > 50 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                    {brief.meta.trustScore}
                                </span>
                                <span className="text-sm text-muted-foreground ml-1">/100</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Based on source credibility & fact-check history</p>
                        </div>

                        {/* Bias Meter */}
                        <div className="space-y-2">
                             <div className="text-xs font-bold text-muted-foreground uppercase text-center md:text-left">Political Bias</div>
                             <BiasChart 
                                score={brief.meta.politicalLean === 'Left' ? -5 : brief.meta.politicalLean === 'Right' ? 5 : 0} 
                                lean={brief.meta.politicalLean} 
                             />
                        </div>
                    </div>

                    {/* 4. Blind Spots / Recommendations */}
                    {brief.recommendations.length > 0 && (
                        <div>
                             <h3 className="font-semibold mb-3 flex items-center gap-2 text-amber-600">
                                <AlertTriangle className="w-4 h-4" /> Consideration
                            </h3>
                             <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                                {brief.recommendations[0]}
                             </div>
                        </div>
                    )}

                </div>
            ) : (
                <div className="text-center py-10 text-muted-foreground">
                    Briefing unavailable.
                </div>
            )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
