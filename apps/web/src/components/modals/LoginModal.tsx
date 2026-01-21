import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons'; // Assuming you have an Icons map or use Lucide

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin?: () => void;
  message?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  onLogin, 
  message = "Sign in to access personalized features." 
}) => {
  const { loginWithGoogle } = useAuth();

  const handleLogin = async () => {
    if (onLogin) {
      onLogin();
    } else {
      await loginWithGoogle();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome to The Gamut</DialogTitle>
          <DialogDescription>
            {message}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button onClick={handleLogin} className="w-full flex gap-2" size="lg">
             {/* Simple Google G icon fallback */}
             <span className="font-bold">G</span> 
             Continue with Google
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
