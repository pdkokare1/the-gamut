import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { ExternalLink } from 'lucide-react';

interface NativeAdProps {
  slotId?: string;
  className?: string;
}

export function NativeAd({ slotId, className }: NativeAdProps) {
  return (
    <div className={cn("py-4", className)}>
      <div className="bg-muted/20 border border-border/40 rounded-xl p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors cursor-pointer group">
        
        {/* Ad Image / Placeholder */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-lg shrink-0 overflow-hidden flex items-center justify-center relative">
           <span className="text-[10px] text-muted-foreground/50 font-mono">AD</span>
           {/* In production, replace with <img /> */}
        </div>

        {/* Ad Content */}
        <div className="flex-1 min-w-0">
           <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Sponsored</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
           </div>
           
           <h4 className="text-sm font-semibold leading-tight mb-1 group-hover:text-primary transition-colors">
             Discover the future of productivity
           </h4>
           <p className="text-xs text-muted-foreground line-clamp-2">
             Unlock your potential with tools designed for modern creators. Try it free today.
           </p>
        </div>
      </div>
    </div>
  );
}
