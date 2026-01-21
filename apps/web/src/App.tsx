import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './utils/trpc';
import { AuthProvider } from './context/AuthContext';
import { AudioProvider } from './context/AudioContext';
import { Toaster } from './components/ui/toaster'; // Shadcn Toast
import NewsFeed from './components/NewsFeed';
import { HelmetProvider } from 'react-helmet-async';

// Import Global CSS (Tailwind)
import './index.css';

export default function App() {
  // 1. Initialize Query Client
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes cache
        retry: 1
      }
    }
  }));

  // 2. Initialize tRPC Client
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: import.meta.env.VITE_API_URL || 'http://localhost:3001/trpc',
          // You can add headers here for auth tokens later
          headers() {
             return {
                 // 'Authorization': getAuthToken() 
             };
          }
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
            <AuthProvider>
              <AudioProvider>
                
                {/* APP LAYOUT */}
                <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-purple-100 selection:text-purple-900">
                  
                  {/* For now, we render the NewsFeed directly as the Home Page. 
                      Later we can add <Routes> here for /profile, /settings, etc. 
                  */}
                  <NewsFeed filters={{}} onFilterChange={() => {}} />

                  {/* GLOBAL OVERLAYS */}
                  <Toaster />
                  {/* <GlobalPlayerBar /> -> We can add this fixed at bottom */}
                
                </div>

              </AudioProvider>
            </AuthProvider>
        </HelmetProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
