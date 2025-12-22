import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Bell, Moon, Sun, Lock, LogOut, Trash2 } from 'lucide-react';

export function SettingsPage() {
  const { user, logout, resetPassword } = useAuth();
  const [notifications, setNotifications] = useState(true);

  const handlePasswordReset = async () => {
    if (user?.email) {
      try {
        await resetPassword(user.email);
        alert("Password reset email sent! Check your inbox.");
      } catch (e) {
        alert("Failed to send reset email. Please try again.");
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 fade-in animate-in slide-in-from-bottom-4 duration-500 pb-10">
      
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-3xl font-logo font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences and account.</p>
      </div>

      {/* 1. PREFERENCES */}
      <section className="glass-card rounded-xl p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2 text-lg">
           <Bell className="h-5 w-5 text-primary" /> Preferences
        </h2>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Push Notifications</p>
            <p className="text-xs text-muted-foreground">Receive daily briefing alerts.</p>
          </div>
          {/* Custom Toggle Switch */}
          <button 
            onClick={() => setNotifications(!notifications)}
            className={`w-11 h-6 flex items-center rounded-full transition-colors ${notifications ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${notifications ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">Dark mode is enabled by default.</p>
          </div>
          <div className="flex gap-2">
             <div className="p-2 bg-secondary rounded-md opacity-50"><Sun className="h-4 w-4" /></div>
             <div className="p-2 bg-primary/20 text-primary rounded-md border border-primary/30"><Moon className="h-4 w-4" /></div>
          </div>
        </div>
      </section>

      {/* 2. ACCOUNT */}
      <section className="glass-card rounded-xl p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2 text-lg">
           <Lock className="h-5 w-5 text-primary" /> Account
        </h2>
        
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase text-muted-foreground">Email Address</label>
          <Input value={user?.email || ''} disabled className="bg-secondary/50 font-mono text-sm" />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-border/50">
           <p className="text-sm text-muted-foreground">Need to change your password?</p>
           <Button variant="outline" size="sm" onClick={handlePasswordReset}>
             Send Reset Link
           </Button>
        </div>
      </section>

      {/* 3. DANGER ZONE */}
      <section className="border border-destructive/20 bg-destructive/5 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-destructive flex items-center gap-2 text-lg">
           Danger Zone
        </h2>
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground text-center md:text-left">
            Once you delete your account, there is no going back. Please be certain.
          </p>

          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="ghost" className="flex-1 md:flex-initial text-muted-foreground hover:text-foreground" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>

            <Button variant="destructive" size="sm" className="flex-1 md:flex-initial">
                <Trash2 className="h-4 w-4 mr-2" /> Delete Account
            </Button>
          </div>
        </div>
      </section>

    </div>
  );
}
