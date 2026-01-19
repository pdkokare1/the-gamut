import React from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ChevronRight, Calendar } from 'lucide-react';

interface TimelineEvent {
  id: string;
  date: string | Date;
  title: string;
  source: string;
  isActive?: boolean;
}

interface TopicTimelineProps {
  topic: string;
  events: TimelineEvent[];
  className?: string;
}

export function TopicTimeline({ topic, events, className }: TopicTimelineProps) {
  return (
    <div className={cn("bg-card rounded-xl border border-border p-5", className)}>
       <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <Calendar className="w-4 h-4 text-primary" />
             <h3 className="font-semibold text-sm">Timeline: {topic}</h3>
          </div>
          <button className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5">
             Full History <ChevronRight className="w-3 h-3" />
          </button>
       </div>

       <div className="relative pl-2 space-y-6">
          {/* Vertical Line */}
          <div className="absolute top-2 bottom-2 left-[15px] w-px bg-border" />

          {events.map((event, index) => (
             <div key={event.id} className="relative flex gap-4 group cursor-pointer">
                {/* Dot */}
                <div className={cn(
                   "z-10 w-2.5 h-2.5 rounded-full border-2 mt-1.5 shrink-0 transition-colors",
                   event.isActive 
                     ? "bg-primary border-primary shadow-[0_0_0_3px_rgba(var(--primary),0.2)]" 
                     : "bg-background border-muted-foreground/50 group-hover:border-primary"
                )} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                   <span className="text-[10px] font-mono text-muted-foreground block mb-0.5">
                      {format(new Date(event.date), 'MMM d, yyyy')}
                   </span>
                   <h4 className={cn(
                      "text-sm font-medium leading-snug transition-colors",
                      event.isActive ? "text-foreground font-semibold" : "text-muted-foreground group-hover:text-foreground"
                   )}>
                      {event.title}
                   </h4>
                   <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                      Source: {event.source}
                   </span>
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}
