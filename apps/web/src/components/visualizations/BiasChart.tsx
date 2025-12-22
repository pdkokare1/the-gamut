import { cn } from '@/lib/utils';

interface BiasChartProps {
  sources: { source: string; lean: string }[];
}

export function BiasChart({ sources }: BiasChartProps) {
  // 1. Calculate Distribution
  const total = sources.length || 1;
  const counts = {
    left: sources.filter(s => s.lean === 'Left' || s.lean === 'Left-Center').length,
    center: sources.filter(s => s.lean === 'Center').length,
    right: sources.filter(s => s.lean === 'Right' || s.lean === 'Right-Center').length,
  };

  const percentages = {
    left: Math.round((counts.left / total) * 100),
    center: Math.round((counts.center / total) * 100),
    right: Math.round((counts.right / total) * 100),
  };

  return (
    <div className="space-y-4">
      {/* Visual Bar */}
      <div className="h-4 w-full rounded-full overflow-hidden flex shadow-inner bg-secondary/30">
        <div style={{ width: `${percentages.left}%` }} className="bg-lean-left h-full transition-all duration-1000 ease-out" />
        <div style={{ width: `${percentages.center}%` }} className="bg-lean-center h-full transition-all duration-1000 ease-out" />
        <div style={{ width: `${percentages.right}%` }} className="bg-lean-right h-full transition-all duration-1000 ease-out" />
      </div>

      {/* Legend / Stats */}
      <div className="grid grid-cols-3 text-center text-xs">
        <div className="space-y-1">
          <p className="font-bold text-lean-left">{percentages.left}%</p>
          <p className="text-muted-foreground uppercase tracking-wider">Left</p>
        </div>
        <div className="space-y-1">
          <p className="font-bold text-lean-center">{percentages.center}%</p>
          <p className="text-muted-foreground uppercase tracking-wider">Center</p>
        </div>
        <div className="space-y-1">
          <p className="font-bold text-lean-right">{percentages.right}%</p>
          <p className="text-muted-foreground uppercase tracking-wider">Right</p>
        </div>
      </div>
    </div>
  );
}
