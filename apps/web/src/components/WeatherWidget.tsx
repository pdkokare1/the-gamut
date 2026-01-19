import React from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/utils/trpc';

export function WeatherWidget() {
  // In a real implementation, you would pass coordinates here
  const { data: weather, isLoading } = trpc.weather.getCurrent.useQuery(
    { lat: 40.7128, lon: -74.0060 }, // Default NYC, or pull from geolocation
    { staleTime: 1000 * 60 * 30 } // 30 mins
  );

  if (isLoading || !weather) {
      return (
          <div className="w-full h-32 rounded-xl bg-muted/40 animate-pulse flex items-center justify-center">
              <Cloud className="w-8 h-8 text-muted-foreground/30" />
          </div>
      );
  }

  // Icon Mapper
  const getIcon = (condition: string) => {
     const c = condition.toLowerCase();
     if (c.includes('rain')) return <CloudRain className="w-8 h-8 text-blue-400" />;
     if (c.includes('cloud')) return <Cloud className="w-8 h-8 text-gray-400" />;
     if (c.includes('wind')) return <Wind className="w-8 h-8 text-slate-400" />;
     return <Sun className="w-8 h-8 text-amber-400" />;
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 p-6 shadow-sm">
       {/* Background Decoration */}
       <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl" />
       
       <div className="relative flex items-center justify-between">
          <div>
             <h4 className="text-sm font-medium text-muted-foreground mb-1">
                {weather.locationName || 'Local Forecast'}
             </h4>
             <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tighter text-foreground">
                   {Math.round(weather.temp)}°
                </span>
                <span className="text-sm font-medium text-muted-foreground capitalize">
                   {weather.condition}
                </span>
             </div>
          </div>
          
          <div className="flex flex-col items-center gap-2">
             {getIcon(weather.condition)}
             <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                   <Droplets className="w-3 h-3" />
                   <span>{weather.humidity}%</span>
                </div>
                <div className="flex items-center gap-1">
                   <Wind className="w-3 h-3" />
                   <span>{weather.windSpeed}km/h</span>
                </div>
             </div>
          </div>
       </div>

       {/* Brief Insights Line */}
       <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
             <span className="font-semibold text-foreground">Insight:</span> {weather.summary || "Conditions are typical for this time of day."}
          </p>
       </div>
    </div>
  );
}
