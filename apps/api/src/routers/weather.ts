// apps/api/src/routers/weather.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import axios from 'axios';

// Constants from your old weatherService.ts
const WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/reverse';

export const weatherRouter = router({
  getWeather: publicProcedure
    .input(
      z.object({
        lat: z.number().optional(),
        lon: z.number().optional(),
        city: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      // 1. Validate Inputs (Logic from old weatherController.ts)
      if (!input.lat || !input.lon) {
          // If city is provided, we could geocode it, but for now we stick to the old 
          // logic which required lat/lon. 
          // Fallback to Pune (Old Default) if totally missing to prevent crash
          if (!input.lat) input.lat = 18.5204;
          if (!input.lon) input.lon = 73.8567;
      }

      try {
        // 2. Fetch Weather Data (Primary - Open Meteo - No Key Required)
        const weatherResponse = await axios.get(WEATHER_BASE_URL, {
            params: {
                latitude: input.lat,
                longitude: input.lon,
                current_weather: true,
                temperature_unit: 'celsius',
            },
            timeout: 5000
        });

        const current = weatherResponse.data.current_weather;
        let cityName = "Local Weather";

        // 3. Fetch Location Name (Secondary - Optional)
        try {
            const locationResponse = await axios.get(GEO_BASE_URL, {
                params: {
                    latitude: input.lat,
                    longitude: input.lon,
                    count: 1, 
                    language: 'en'
                },
                timeout: 4000 
            });

            if (locationResponse.data.results && locationResponse.data.results.length > 0) {
                const res = locationResponse.data.results[0];
                cityName = res.name || res.admin1 || "Local Weather";
            }
        } catch (geoError) {
            console.warn('⚠️ Weather Geo-lookup failed, using default name.');
        }

        // 4. Return Normalized Data (Matches Frontend Expectation)
        return {
          temp: current.temperature,
          condition: mapWeatherCode(current.weathercode), // Helper function below
          location: cityName,
          humidity: 0, // OpenMeteo 'current_weather' doesn't send humidity by default, defaulting to safe 0
          windSpeed: current.windspeed,
          description: current.is_day === 1 ? 'Day' : 'Night',
          icon: current.is_day === 1 ? '01d' : '01n', // Simple mapping
        };

      } catch (error: any) {
        console.error('Weather API Error:', error.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch weather data',
        });
      }
    }),
});

// Helper to map OpenMeteo codes to readable strings (Simple version)
function mapWeatherCode(code: number): string {
    if (code === 0) return 'Clear';
    if (code >= 1 && code <= 3) return 'Cloudy';
    if (code >= 45 && code <= 48) return 'Fog';
    if (code >= 51 && code <= 67) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 95) return 'Storm';
    return 'Unknown';
}

/* // --- PREVIOUS CODE (OPENWEATHERMAP) ---
// Kept for reference. Requires OPENWEATHER_API_KEY env var.
// 
// if (!apiKey) { ... return mock ... }
// let url = `https://api.openweathermap.org/data/2.5/weather?appid=${apiKey}&units=metric`;
// ...
*/
