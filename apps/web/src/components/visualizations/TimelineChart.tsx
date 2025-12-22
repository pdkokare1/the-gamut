import { Circle } from 'lucide-react';

interface TimelineEvent {
  date: string | Date;
  headline: string;
  source: string;
}

interface TimelineChartProps {
  events: TimelineEvent[];
}

export function TimelineChart({ events }: TimelineChartProps) {
  if (events.length === 0) return <div className="text-center text-muted-foreground text-sm">No timeline data available.</div>;

  return (
    <div className="relative pl-4 border-l border-border/50 space-y-6 my-4">
      {events.map((event, index) => (
        <div key={index} className="relative group">
          {/* Dot */}
          <div className="absolute -left-[21px] top-1 bg-background rounded-full p-1 border border-border group-hover:border-primary transition-colors">
            <Circle className="h-2 w-2 text-primary fill-primary" />
          </div>
          
          {/* Content */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">
              {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <p className="text-sm font-medium leading-tight group-hover:text-primary transition-colors cursor-default">
              {event.headline}
            </p>
            <p className="text-xs text-muted-foreground">{event.source}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
