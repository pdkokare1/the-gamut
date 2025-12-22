import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input'; // Assuming standard Shadcn input
import { Bell, Moon, Sun, Lock, LogOut, Trash2 } from 'lucide-react';
import { toast } from 'sonner'; // Assuming we use sonner or similar toast, or standard alert

export function SettingsPage() {
  const { user, logout, resetPassword } = useAuth();
  const [notifications, setNotifications] = useState(true);

  const handlePasswordReset = async () => {
    if (user?.email) {
      try {
        await resetPassword(user.email);
        toast.success("Password reset email sent!");
      } catch (e) {
        toast.error("Failed to send reset email.");
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 fade-in">
      
      <div className="mb-6">
        <h1 className="text-3xl font-logo font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences and account.</p>
      </div>

      {/* 1. PREFERENCES */}
      <section className="glass-card rounded-xl p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2">
           <Bell className="h-4 w-4 text-primary" /> Preferences
        </h2>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Push Notifications</p>
            <p className="text-xs text-muted-foreground">Receive daily briefing alerts.</p>
          </div>
          {/* Simple Toggle Switch */}
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
             {/* Visual indicator only since theme is handled globally */}
             <div className="p-2 bg-secondary rounded-md opacity-50"><Sun className="h-4 w-4" /></div>
             <div className="p-2 bg-primary/20 text-primary rounded-md"><Moon className="h-4 w-4" /></div>
          </div>
        </div>
      </section>

      {/* 2. ACCOUNT */}
      <section className="glass-card rounded-xl p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2">
           <Lock className="h-4 w-4 text-primary" /> Account
        </h2>
        
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase text-muted-foreground">Email Address</label>
          <Input value={user?.email || ''} disabled className="bg-secondary/50" />
        </div>

        <div className="flex justify-between items-center pt-2">
           <p className="text-sm text-muted-foreground">Want to change your password?</p>
           <Button variant="outline" size="sm" onClick={handlePasswordReset}>
             Send Reset Link
           </Button>
        </div>
      </section>

      {/* 3. DANGER ZONE */}
      <section className="border border-destructive/20 bg-destructive/5 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-destructive flex items-center gap-2">
           Danger Zone
        </h2>
        
        <div className="flex justify-between items-center">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>

          <Button variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" /> Delete Account
          </Button>
        </div>
      </section>

    </div>
  );
}
