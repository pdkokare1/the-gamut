import { useParams } from 'react-router-dom';
import { trpc } from '../utils/trpc';
import { Loader2, ShieldAlert, Scale, BookOpen, BarChart3, Clock } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { BiasChart } from '../components/visualizations/BiasChart';
import { TimelineChart } from '../components/visualizations/TimelineChart';

export function NarrativePage() {
  const { id } = useParams<{ id: string }>();
  
  const { data: narrative, isLoading } = trpc.narrative.getById.useQuery(
    { id: parseInt(id || '0') },
    { enabled: !!id }
  );

  // Fallback / Mock Data for Visuals (since schema might not have these fully populated yet)
  const mockSources = narrative?.sources.map(s => ({ 
    source: s, 
    lean: ['Left', 'Center', 'Right', 'Left-Center', 'Right-Center'][Math.floor(Math.random() * 5)] 
  })) || [];

  const mockTimeline = [
    { date: new Date(Date.now() - 10000000), headline: "Breaking: Initial reports emerge", source: "AP News" },
    { date: new Date(Date.now() - 5000000), headline: "Official statement released", source: "Reuters" },
    { date: new Date(Date.now()), headline: "Analysis: What this means for markets", source: "Bloomberg" },
  ];

  if (isLoading) {
    return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-primary h-8 w-8" /></div>;
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
      
      {/* 1. HEADER */}
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

      {/* 2. INTELLIGENCE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Bias Distribution */}
        <section className="glass-card p-6 rounded-xl space-y-4">
           <div className="flex items-center gap-2 border-b border-border pb-2">
             <BarChart3 className="h-5 w-5 text-primary" />
             <h3 className="font-bold text-lg">Coverage Bias</h3>
           </div>
           <BiasChart sources={mockSources} />
        </section>

        {/* Timeline */}
        <section className="glass-card p-6 rounded-xl space-y-4">
           <div className="flex items-center gap-2 border-b border-border pb-2">
             <Clock className="h-5 w-5 text-primary" />
             <h3 className="font-bold text-lg">Story Evolution</h3>
           </div>
           <TimelineChart events={mockTimeline} />
        </section>
      </div>

      {/* 3. SPLIT VIEW: Consensus vs. Divergence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        <section className="glass-card p-6 rounded-xl space-y-4">
           <div className="flex items-center gap-2 border-b border-border pb-2">
             <ShieldAlert className="h-5 w-5 text-orange-500" />
             <h3 className="font-bold text-lg">Key Divergences</h3>
           </div>
           <div className="space-y-4">
              <p className="text-sm text-muted-foreground">How perspectives differed:</p>
               <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                 <span className="font-bold text-blue-400">Left Leaning:</span> Focused on social impact.
               </div>
               <div className="p-3 bg-secondary/30 rounded-lg text-sm">
                 <span className="font-bold text-red-400">Right Leaning:</span> Focused on fiscal responsibility.
               </div>
           </div>
        </section>
      </div>
    </div>
  );
}
