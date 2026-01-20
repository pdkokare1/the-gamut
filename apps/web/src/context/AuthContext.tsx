// apps/web/src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { trpc } from '@/utils/trpc';

// Define the shape of the Context
interface AuthContextType {
  user: User | null;
  loading: boolean;
  isGuest: boolean; // RESTORED: Helper for UI locking
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // tRPC Utils to invalidate queries on login
  const utils = trpc.useContext();

  // Mutation to sync user to DB on login
  const syncUser = trpc.profile.syncUser.useMutation({
      onSuccess: () => {
          // Refresh profile data once synced
          utils.profile.get.invalidate(); 
      }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const t = await currentUser.getIdToken();
        setToken(t);
        
        // Auto-sync user to backend DB (Idempotent)
        syncUser.mutate({
            email: currentUser.email || '',
            username: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            photoUrl: currentUser.photoURL || undefined
        });
      } else {
        setToken(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signup = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
    utils.invalidate(); // Clear all tRPC cache on logout
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{ 
        user, 
        loading, 
        token, 
        isGuest: !user, // Derived state for easy use
        login, 
        signup, 
        loginWithGoogle, 
        logout, 
        resetPassword 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
