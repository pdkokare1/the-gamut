import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/utils/trpc';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AudioProvider } from '@/context/AudioContext';
import { BrowserRouter } from 'react-router-dom';

// We need a sub-component to access useAuth() for the token
function TrpcProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5, // 5 minutes
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: import.meta.env.VITE_API_URL || 'http://localhost:3000/trpc',
          // Auto-inject Auth Token into Headers
          async headers() {
            return {
              Authorization: token ? `Bearer ${token}` : '',
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AudioProvider>
             {children}
        </AudioProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      {/* AuthProvider is outer-most so TrpcProvider can access the token */}
      <AuthProvider>
        <TrpcProvider>
          {children}
        </TrpcProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
