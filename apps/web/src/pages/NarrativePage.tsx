import { useParams } from 'react-router-dom';
import { trpc } from '../utils/trpc';
import { Loader2, ArrowRight, ShieldAlert, Scale, BookOpen } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { FeedItem } from '../components/FeedItem';

export function NarrativePage() {
  const { id } = useParams<{ id: string }>();
  
  // Fetch Narrative Cluster Data
  // Note: We use the 'clusterId' usually, but here we assume the route passes the cluster ID
  const { data: narrative, isLoading } = trpc.narrative.getById.useQuery(
    { id: parseInt(id || '0') },
    { enabled: !!id }
  );

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary h-8 w-8" />
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold">Narrative not found</h2>
        <p className="text-muted-foreground">This cluster may have expired or been merged.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in pb-10">
      
      {/* 1. HEADER: The "Master Narrative" */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
           <Badge variant="outline" className="border-primary text-primary uppercase tracking-widest text-[10px]">
             Cluster Analysis
           </Badge>
           <span className="text-xs text-muted-foreground">
             {narrative.sourceCount} Sources Analyzed
           </span>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-logo font-bold leading-tight">
          {narrative.masterHeadline}
        </h1>
        
        <div className="glass-card p-6 rounded-xl border-l-4 border-l-primary bg-secondary/5">
          <p className="text-lg leading-relaxed text-foreground/90">
            {narrative.executiveSummary}
          </p>
        </div>
      </section>

      {/* 2. SPLIT VIEW: Consensus vs. Divergence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* LEFT: Consensus (The Facts) */}
        <section className="glass-card p-6 rounded-xl space-y-4">
           <div className="flex items-center gap-2 border-b border-border pb-2">
             <Scale className="h-5 w-5 text-green-500" />
             <h3 className="font-bold text-lg">Consensus Points</h3>
           </div>
           <ul className="space-y-3">
             {narrative.consensusPoints.map((point, i) => (
               <li key={i} className="flex gap-3 text-sm">
                 <span className="text-green-500 font-bold">•</span>
                 <span className="text-muted-foreground">{point}</span>
               </li>
             ))}
           </ul>
        </section>

        {/* RIGHT: Divergence (The Spin) */}
        <section className="glass-card p-6 rounded-xl space-y-4">
           <div className="flex items-center gap-2 border-b border-border pb-2">
             <ShieldAlert className="h-5 w-5 text-orange-500" />
             <h3 className="font-bold text-lg">Key Divergences</h3>
           </div>
           {/* If divergence points exist (assuming structure), map them. 
               If simple string array, map directly. */}
           <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                How different sources framed this event:
              </p>
              {/* Placeholder for complex divergence mapping if schema allows, 
                  otherwise showing static example or mapping simple strings */}
               <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                 <span className="font-bold text-blue-400">Left Leaning:</span> Focused on humanitarian impact.
               </div>
               <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                 <span className="font-bold text-red-400">Right Leaning:</span> Focused on economic consequences.
               </div>
           </div>
        </section>
      </div>

      {/* 3. SOURCE STREAM */}
      <section className="space-y-4">
        <h3 className="font-bold text-xl flex items-center gap-2">
           <BookOpen className="h-5 w-5" /> Full Coverage
        </h3>
        
        {/* We would fetch related articles here. For now, we assume they might be attached 
            or we fetch them via a separate query component. 
            For this file, I'll show a placeholder for the list. */}
        <div className="grid gap-4">
           {/* In a real scenario, map <FeedItem /> here */}
           <div className="p-8 text-center text-muted-foreground border-dashed border-2 border-border rounded-xl">
             Associated articles loading...
           </div>
        </div>
      </section>

    </div>
  );
}
