import { cn } from '../../lib/utils';

interface BiasChartProps {
  score: number; // -10 (Far Left) to 10 (Far Right)
  lean: string;
}

export function BiasChart({ score, lean }: BiasChartProps) {
  // Normalize score to percentage (0% = Far Left, 50% = Center, 100% = Far Right)
  // Assuming input score is -10 to 10
  const percentage = ((score + 10) / 20) * 100;

  return (
    <div className="flex flex-col items-center w-full space-y-2">
      <div className="relative w-full h-4 bg-muted rounded-full overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-gray-300 to-red-500 opacity-50" />
        
        {/* Needle */}
        <div 
            className="absolute top-0 bottom-0 w-1 bg-foreground shadow-sm transition-all duration-500 ease-out"
            style={{ left: `${Math.min(Math.max(percentage, 0), 100)}%` }}
        />
      </div>
      
      <div className="flex justify-between w-full text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        <span className="text-blue-600">Left</span>
        <span className="text-gray-500">Center</span>
        <span className="text-red-600">Right</span>
      </div>
      
      <div className="text-xs font-medium border px-2 py-0.5 rounded bg-background/50">
        Rated: <span className={cn(
            lean === 'Left' ? "text-blue-600" : 
            lean === 'Right' ? "text-red-600" : "text-gray-600"
        )}>{lean}</span> ({score > 0 ? '+' : ''}{score})
      </div>
    </div>
  );
}
