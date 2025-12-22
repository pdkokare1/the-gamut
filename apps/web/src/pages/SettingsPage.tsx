import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { trpc } from '@/utils/trpc';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Moon, Sun, LogOut, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useContext();
  
  // Theme State (Mock - replace with real theme context if available)
  const [isDark, setIsDark] = useState(true);

  // Profile Form State
  const { data: profile, isLoading } = trpc.profile.getMyProfile.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success('Profile updated successfully');
      utils.profile.getMyProfile.invalidate();
    }
  });

  const [username, setUsername] = useState(profile?.username || '');

  const handleSaveProfile = () => {
    if (!user) return;
    updateProfile.mutate({ username });
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 fade-in">
       
       <h1 className="text-3xl font-heading font-bold">Settings</h1>

       {/* 1. Appearance */}
       <Card>
          <CardHeader>
             <CardTitle>Appearance</CardTitle>
             <CardDescription>Customize how The Gamut looks on your device.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <Label htmlFor="dark-mode">Dark Mode</Label>
             </div>
             <Switch 
                id="dark-mode" 
                checked={isDark} 
                onCheckedChange={setIsDark}
                // Hook this to your actual theme provider later
             />
          </CardContent>
       </Card>

       {/* 2. Account Profile */}
       <Card>
          <CardHeader>
             <CardTitle>Profile Information</CardTitle>
             <CardDescription>Update your public profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user?.email || ''} disabled className="bg-muted" />
             </div>
             <div className="space-y-2">
                <Label>Username</Label>
                <Input 
                  defaultValue={profile?.username} 
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter a username"
                />
             </div>
             <div className="pt-2">
                <Button onClick={handleSaveProfile} disabled={updateProfile.isLoading}>
                   {updateProfile.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   Save Changes
                </Button>
             </div>
          </CardContent>
       </Card>

       {/* 3. Session */}
       <Card>
          <CardHeader>
             <CardTitle>Session</CardTitle>
             <CardDescription>Manage your current login session.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button variant="outline" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
             </Button>
          </CardContent>
       </Card>

       {/* 4. Danger Zone */}
       <div className="border border-destructive/30 rounded-xl p-6 bg-destructive/5 space-y-4">
          <div>
             <h3 className="text-lg font-bold text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Delete Account
             </h3>
             <p className="text-sm text-muted-foreground mt-1">
                Permanently remove your account and all associated data. This action cannot be undone.
             </p>
          </div>
          <Button variant="destructive">Delete Account</Button>
       </div>

    </div>
  );
}
