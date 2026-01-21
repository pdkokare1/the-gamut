import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { trpc } from '@/utils/trpc';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Share2, BookOpen } from 'lucide-react';

interface NarrativeModalProps {
  narrativeId: string;
  onClose: () => void;
}

export const NarrativeModal: React.FC<NarrativeModalProps> = ({ narrativeId, onClose }) => {
  // Fetch narrative details via tRPC
  const { data: narrative, isLoading } = trpc.narrative.getById.useQuery({ id: narrativeId });

  return (
    <Dialog open={!!narrativeId} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0">
        
        {/* HEADER */}
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
              Developing Story
            </Badge>
            {narrative && (
              <span className="text-xs text-muted-foreground">
                Updated {formatDistanceToNow(new Date(narrative.lastUpdated), { addSuffix: true })}
              </span>
            )}
          </div>
          <DialogTitle className="text-xl font-serif font-bold leading-tight">
            {narrative?.masterHeadline || "Loading Narrative..."}
          </DialogTitle>
        </DialogHeader>

        {/* SCROLLABLE CONTENT */}
        <ScrollArea className="flex-1 p-6 pt-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <p className="text-sm text-muted-foreground">Synthesizing {narrativeId}...</p>
            </div>
          ) : narrative ? (
            <div className="space-y-6">
              
              {/* Executive Summary */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Executive Summary
                </h4>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {narrative.executiveSummary}
                </p>
              </div>

              <Separator />

              {/* Key Consensus Points */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Consensus Points
                </h4>
                <ul className="space-y-2">
                  {narrative.consensusPoints?.map((point: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-purple-600 font-bold">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Source Breakdown (Divergence) */}
              {narrative.divergencePoints?.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Diverging Perspectives
                    </h4>
                    {narrative.divergencePoints.map((div: any, i: number) => (
                      <div key={i} className="bg-muted/30 p-3 rounded-lg border text-sm space-y-2">
                        <p className="font-medium text-foreground">{div.point}</p>
                        <div className="flex flex-wrap gap-2">
                          {div.perspectives.map((p: any, j: number) => (
                            <Badge key={j} variant="secondary" className="text-xs">
                              {p.source}: {p.stance}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              Narrative not found.
            </div>
          )}
        </ScrollArea>

        {/* FOOTER ACTIONS */}
        <div className="p-4 border-t bg-muted/10 flex justify-between items-center">
            <Button variant="ghost" size="sm" className="gap-2">
                <Share2 className="w-4 h-4" /> Share
            </Button>
            <Button onClick={onClose}>Close</Button>
        </div>

      </DialogContent>
    </Dialog>
  );
};
