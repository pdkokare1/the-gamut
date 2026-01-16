import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import axios from 'axios';

// Define the shape of the weather response for type safety
const WeatherSchema = z.object({
  temp: z.number(),
  condition: z.string(),
  location: z.string(),
  humidity: z.number(),
  windSpeed: z.number(),
  description: z.string(),
  icon: z.string(),
});

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
      try {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) {
            console.warn("OPENWEATHER_API_KEY is missing");
            // Return mock data if key is missing (dev mode fallback)
            return {
                temp: 24,
                condition: 'Clear',
                location: 'Pune, India',
                humidity: 45,
                windSpeed: 12,
                description: 'Sunny',
                icon: '01d'
            };
        }

        let url = `https://api.openweathermap.org/data/2.5/weather?appid=${apiKey}&units=metric`;
        
        if (input.city) {
            url += `&q=${encodeURIComponent(input.city)}`;
        } else if (input.lat && input.lon) {
            url += `&lat=${input.lat}&lon=${input.lon}`;
        } else {
            // Default to Pune if nothing provided
            url += `&q=Pune,IN`;
        }

        const response = await axios.get(url);
        const data = response.data;

        return {
          temp: Math.round(data.main.temp),
          condition: data.weather[0].main,
          location: data.name,
          humidity: data.main.humidity,
          windSpeed: data.wind.speed,
          description: data.weather[0].description,
          icon: data.weather[0].icon,
        };
      } catch (error) {
        console.error('Weather API Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch weather data',
        });
      }
    }),
});
