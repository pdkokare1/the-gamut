import { useEffect, useState } from 'react';
import { trpc } from '../utils/trpc';
import { Cloud, Sun, CloudRain, Wind, Droplets, MapPin, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function WeatherWidget() {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | undefined>();
  
  // Get user location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Location access denied, using default', error);
        }
      );
    }
  }, []);

  const { data: weather, isLoading, isError } = trpc.weather.getWeather.useQuery(
    coords || { city: 'Pune' }, // Fallback to Pune if no coords yet
    { 
      staleTime: 1000 * 60 * 30, // Cache for 30 minutes
      retry: false
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 bg-muted/20 rounded-xl h-24 w-full animate-pulse">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !weather) {
    return null; // Hide widget on error gracefully
  }

  // Dynamic icon selection
  const getIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'clouds': return <Cloud className="w-8 h-8 text-blue-400" />;
      case 'rain': 
      case 'drizzle': return <CloudRain className="w-8 h-8 text-blue-600" />;
      case 'clear': return <Sun className="w-8 h-8 text-yellow-500" />;
      default: return <Sun className="w-8 h-8 text-orange-400" />;
    }
  };

  return (
    <div className="bg-card/50 backdrop-blur-sm border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all hover:bg-card/80">
      <div className="flex items-center gap-4">
        {getIcon(weather.condition)}
        <div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
            <MapPin className="w-3 h-3" />
            {weather.location}
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {weather.temp}°
            <span className="text-sm font-normal text-muted-foreground ml-1">{weather.condition}</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1 text-xs text-muted-foreground text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Wind className="w-3 h-3" />
          {weather.windSpeed} km/h
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <Droplets className="w-3 h-3" />
          {weather.humidity}%
        </div>
      </div>
    </div>
  );
}
