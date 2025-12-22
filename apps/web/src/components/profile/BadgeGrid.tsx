import { Award, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/custom-tooltip'; // Assuming you have or will use a standard tooltip

// Fallback badge definitions if DB doesn't provide metadata
const BADGE_ICONS: Record<string, string> = {
  newcomer: '🌱',
  avid_reader: '📚',
  news_junkie: '⚡',
  week_streak: '🔥',
  scholar: '🎓',
  pioneer: '🚀',
};

interface Badge {
  id: string;
  label: string;
  description: string;
  earnedAt?: string | Date;
}

interface BadgeGridProps {
  earnedBadges: Badge[];
  allBadges?: Badge[]; // Optional: to show locked badges
}

export function BadgeGrid({ earnedBadges }: BadgeGridProps) {
  if (earnedBadges.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
        <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No badges earned yet. Start reading!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
      {earnedBadges.map((badge) => (
        <div 
          key={badge.id} 
          className="group relative flex flex-col items-center p-4 rounded-xl glass-card hover:bg-primary/5 transition-colors cursor-default"
        >
          <div className="text-3xl mb-2 filter drop-shadow-md group-hover:scale-110 transition-transform duration-300">
            {BADGE_ICONS[badge.id] || '🏅'}
          </div>
          <span className="text-xs font-medium text-center leading-tight">
            {badge.label}
          </span>
          
          {/* Simple Tooltip Overlay */}
          <div className="absolute inset-0 bg-black/80 text-white text-[10px] p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-center pointer-events-none backdrop-blur-sm">
            {badge.description}
          </div>
        </div>
      ))}
    </div>
  );
}
