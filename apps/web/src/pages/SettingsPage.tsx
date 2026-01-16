// apps/web/src/pages/SettingsPage.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { trpc } from '../utils/trpc';
import { getToken } from 'firebase/messaging';
import { messaging } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { 
    User, Bell, Trash2, LogOut, 
    Moon, Sun, Smartphone, Shield,
    ChevronRight, Loader2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch'; // Ensure you have this Shadcn component
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Queries
  const { data: profile } = trpc.profile.getMe.useQuery(undefined, { enabled: !!user });
  const updateProfile = trpc.profile.update.useMutation();

  // Notification Logic
  const enableNotifications = async () => {
    if (!messaging) return alert("Not supported on this device.");
    
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await getToken(messaging, { 
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
            });
            if (token) {
                await updateProfile.mutateAsync({ fcmToken: token, notificationsEnabled: true });
                alert("Notifications enabled!");
            }
        }
    } catch (err) {
        console.error("Notification Error", err);
    }
  };

  const handleDelete = async () => {
     // Implement account deletion logic here (usually a separate mutation)
     alert("Feature pending: Safe Account Deletion");
     setDeleteDialogOpen(false);
  };

  if (!user) return <div className="p-8 text-center">Please log in to view settings.</div>;

  return (
    <div className="container max-w-md mx-auto px-4 py-6 space-y-8 pb-24">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* PROFILE SECTION */}
      <section className="space-y-4">
         <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Account</h2>
         <div className="bg-card border rounded-xl divide-y">
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full" />
                    ) : (
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                        </div>
                    )}
                    <div>
                        <p className="font-medium">{profile?.username || user.displayName || 'User'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                </div>
            </div>
         </div>
      </section>

      {/* PREFERENCES */}
      <section className="space-y-4">
         <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preferences</h2>
         <div className="bg-card border rounded-xl divide-y">
            
            {/* Notifications */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Daily Briefing</p>
                        <p className="text-xs text-muted-foreground">Get morning summaries</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={enableNotifications}>
                    {profile?.notificationsEnabled ? 'On' : 'Enable'}
                </Button>
            </div>

            {/* Appearance (Placeholder for Theme Context) */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <Moon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">Dark Mode</p>
                        <p className="text-xs text-muted-foreground">Adjust app theme</p>
                    </div>
                </div>
                {/* You would hook this up to your ThemeProvider */}
                <Switch checked={true} onCheckedChange={() => {}} /> 
            </div>
         </div>
      </section>

      {/* LEGAL & SUPPORT */}
      <section className="space-y-4">
         <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Support</h2>
         <div className="bg-card border rounded-xl divide-y">
            <button className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left" onClick={() => navigate('/legal')}>
                <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Privacy & Terms</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
         </div>
      </section>

      {/* DANGER ZONE */}
      <section className="pt-8">
         <Button 
            variant="ghost" 
            className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 mb-2"
            onClick={() => setDeleteDialogOpen(true)}
         >
             <Trash2 className="w-4 h-4 mr-2" />
             Delete Account
         </Button>
         
         <Button 
            variant="outline" 
            className="w-full"
            onClick={() => signOut()}
         >
             <LogOut className="w-4 h-4 mr-2" />
             Sign Out
         </Button>
      </section>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Delete Account?</DialogTitle>
                <DialogDescription>
                    This action cannot be undone. All your saved articles, reading history, and badges will be permanently removed.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete}>Delete Permanently</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
