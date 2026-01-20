import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { signInWithGoogle } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={24} />
        </button>

        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Unlock Balanced View</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Sign in to access our exclusive AI-curated balanced feeds and bias analysis tools.
          </p>
          
          <div className="pt-4">
            <Button 
              onClick={() => { signInWithGoogle(); onClose(); }} 
              className="w-full py-6 text-lg"
            >
              Continue with Google
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
