import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BiasMapProps {
  articles: {
    id: string;
    biasScore: number;
    credibilityGrade: string; // 'A', 'B', etc.
    headline: string;
  }[];
}

export const BiasMap: React.FC<BiasMapProps> = ({ articles }) => {
  
  // Convert Grade (A, B, C) to a number (0-100) for plotting
  const getReliabilityScore = (grade: string) => {
    const map: Record<string, number> = { 'A+': 95, 'A': 90, 'B+': 80, 'B': 75, 'C': 60, 'D': 40, 'F': 20 };
    return map[grade] || 50;
  };

  return (
    <div className="relative w-full h-full border border-border bg-muted/20 rounded-lg overflow-hidden">
      
      {/* Grid Lines */}
      <div className="absolute inset-0 flex flex-col justify-between p-4 opacity-10 pointer-events-none">
         <div className="border-b border-foreground w-full h-1/2 absolute top-0" />
         <div className="border-r border-foreground h-full w-1/2 absolute left-0" />
      </div>

      {/* Axis Labels */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] uppercase text-muted-foreground font-bold">High Quality</div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase text-muted-foreground font-bold">Low Quality</div>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground font-bold -rotate-90">Left</div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground font-bold rotate-90">Right</div>

      {/* Plot Points */}
      <TooltipProvider>
        {articles.map((article) => {
           // Bias: 0 (Left) -> 100 (Right). Assuming API returns 0-100 where 50 is center.
           // If API returns biasScore as "absolute bias" (0-10), we might need to adjust logic based on 'lean'.
           // For now assuming 0=Left, 50=Center, 100=Right for visualization purposes.
           const x = article.biasScore || 50; 
           const y = getReliabilityScore(article.credibilityGrade);

           return (
             <Tooltip key={article.id}>
               <TooltipTrigger asChild>
                 <div 
                   className="absolute w-3 h-3 rounded-full bg-primary/70 hover:bg-primary hover:scale-150 transition-all cursor-pointer shadow-sm border border-white/20"
                   style={{ 
                     left: `${x}%`, 
                     bottom: `${y}%`,
                     transform: 'translate(-50%, 50%)' 
                   }}
                 />
               </TooltipTrigger>
               <TooltipContent>
                 <p className="max-w-xs text-xs">{article.headline}</p>
               </TooltipContent>
             </Tooltip>
           );
        })}
      </TooltipProvider>

      {/* Center Point */}
      <div className="absolute left-1/2 bottom-1/2 w-1.5 h-1.5 bg-foreground/20 rounded-full -translate-x-1/2 translate-y-1/2" />
    </div>
  );
};
