import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { trpc } from '@/utils/trpc';
import { useToast } from '@/components/ui/use-toast';
import { LoginModal } from '@/components/modals/LoginModal';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { toast } = useToast();

  // tRPC Mutation to sync Firebase User -> Postgres DB
  const syncProfile = trpc.profile.sync.useMutation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // Sync user to backend immediately upon auth state confirmation
          // This ensures the Postgres DB has a record for foreign key relations
          await syncProfile.mutateAsync({
             email: currentUser.email || '',
             displayName: currentUser.displayName || 'Anonymous',
             photoURL: currentUser.photoURL || ''
          });
        } catch (error) {
          console.error("Profile Sync Failed", error);
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast({
        title: "Welcome Back",
        description: "Successfully logged in.",
      });
      setIsLoginModalOpen(false);
    } catch (error: any) {
      console.error("Login Error:", error);
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Logged Out",
        description: "See you next time!",
      });
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // Simple Admin Check (Expand this logic based on your needs)
  const isAdmin = user?.email === 'admin@thegamut.com' || false;

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAdmin, 
      loginWithGoogle, 
      logout,
      openLoginModal,
      closeLoginModal
    }}>
      {children}
      
      {/* Global Login Modal is rendered here to avoid prop drilling */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={closeLoginModal} 
        onLogin={loginWithGoogle} 
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
