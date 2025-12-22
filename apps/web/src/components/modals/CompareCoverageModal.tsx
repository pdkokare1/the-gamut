import React, { useState } from 'react';
import { trpc } from '@/utils/trpc';
import { TimelineChart } from '@/components/visualizations/TimelineChart'; 
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompareModalProps {
  clusterId: number | null;
  articleTitle: string;
  onClose: () => void;
  onAnalyze: (article: any) => void;
  showTooltip: (text: string, e: React.MouseEvent) => void;
}

export const CompareCoverageModal: React.FC<CompareModalProps> = ({ clusterId, articleTitle, onClose, onAnalyze, showTooltip }) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'left' | 'center' | 'right' | 'reviews'>('timeline'); 

  // OPTIMIZATION: tRPC handles loading/error states automatically
  const { data: clusterData, isLoading } = trpc.narrative.getClusterById.useQuery(
    { id: clusterId || 0 }, 
    { enabled: !!clusterId }
  );

  if (!clusterId) return null;

  const handleOverlayClick = (e: React.MouseEvent) => { 
      if (e.target === e.currentTarget) onClose(); 
  };

  const left = clusterData?.left || [];
  const center = clusterData?.center || [];
  const right = clusterData?.right || [];
  const reviews = clusterData?.reviews || [];
  const total = left.length + center.length + right.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" onClick={handleOverlayClick}>
      <div className="w-full max-w-4xl bg-background border border-border rounded-xl shadow-2xl flex flex-col h-[85vh]" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-start">
          <div>
              <h2 className="text-xl font-heading font-semibold line-clamp-1">
                Compare: "{articleTitle}"
              </h2>
              <div className="flex mt-2 h-1.5 w-64 rounded-full overflow-hidden bg-muted">
                  <div style={{ width: `${(left.length/total)*100}%` }} className="bg-blue-500" />
                  <div style={{ width: `${(center.length/total)*100}%` }} className="bg-purple-500" />
                  <div style={{ width: `${(right.length/total)*100}%` }} className="bg-red-500" />
              </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6 gap-6 text-sm font-medium">
          {['timeline', 'left', 'center', 'right', 'reviews'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={cn(
                "py-3 border-b-2 capitalize transition-colors",
                activeTab === tab 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === 'timeline' ? 'Timeline' : `${tab} (${clusterData?.[tab as keyof typeof clusterData]?.length || 0})`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden relative bg-muted/10">
          {isLoading ? ( 
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-full p-6">
              {activeTab === 'timeline' && (
                 <div className="h-[400px] w-full">
                     {/* Using the new Visualization Component */}
                     <TimelineChart data={clusterData?.stats?.timeline || []} />
                 </div>
              )}

              {activeTab !== 'timeline' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* @ts-ignore - Dynamic access */}
                    {(clusterData?.[activeTab] || []).map((article: any) => (
                        <div key={article.id} className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow flex flex-col gap-3">
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-[10px] font-bold uppercase text-primary tracking-wider truncate">
                                    {article.source}
                                </span>
                                <Badge variant={activeTab === 'left' ? 'default' : activeTab === 'right' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 h-5">
                                    {article.biasScore ? `Bias: ${article.biasScore}` : 'N/A'}
                                </Badge>
                            </div>
                            
                            <h4 className="font-semibold text-sm leading-snug line-clamp-3">
                                {article.headline}
                            </h4>
                            
                            <p className="text-xs text-muted-foreground line-clamp-3">
                                {article.summary}
                            </p>

                            <div className="mt-auto pt-2 flex gap-2">
                                <Button size="sm" variant="outline" className="w-full text-xs h-8" asChild>
                                    <a href={article.url} target="_blank" rel="noreferrer">Read</a>
                                </Button>
                                <Button size="sm" variant="secondary" className="w-full text-xs h-8" onClick={() => onAnalyze(article)}>
                                    Analyze
                                </Button>
                            </div>
                        </div>
                    ))}
                 </div>
              )}
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompareCoverageModal;
