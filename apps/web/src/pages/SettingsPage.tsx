import { trpc } from "../utils/trpc";
import { auth } from "../lib/firebase";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Switch } from "../components/ui/switch"; // Assumes you have a switch component or use checkbox
import { Bell, Shield, LogOut, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function SettingsPage() {
  const navigate = useNavigate();
  const { data: profile } = trpc.profile.getMe.useQuery();
  
  // Note: Actual mutation to update settings would go here
  // const updateSettings = trpc.profile.updateSettings.useMutation();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  if (!profile) return <div className="p-8 text-center">Please log in to manage settings.</div>;

  return (
    <div className="container mx-auto max-w-xl p-4 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
                <Bell className="mr-2 h-5 w-5 text-indigo-500" /> Notifications
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium text-slate-900">Daily Briefing</p>
                    <p className="text-sm text-slate-500">Get a morning summary of top stories.</p>
                </div>
                {/* Placeholder Switch - Logic to be connected to backend update */}
                <div className="h-6 w-11 bg-slate-200 rounded-full relative cursor-pointer">
                    <div className={`absolute left-1 top-1 h-4 w-4 rounded-full transition-all ${profile.notificationsEnabled ? 'bg-indigo-600 translate-x-5' : 'bg-slate-400'}`}></div>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
                <Shield className="mr-2 h-5 w-5 text-green-500" /> Account
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-md">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Email</p>
                <p className="text-slate-900">{profile.email}</p>
            </div>
            
            <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
            
            <div className="pt-4 border-t">
                <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-700 text-xs">
                    <Trash2 className="mr-2 h-3 w-3" /> Delete Account
                </Button>
            </div>
        </CardContent>
      </Card>
      
      <div className="text-center text-xs text-slate-400">
        App Version 2.5.0 (Gemini Build)
      </div>
    </div>
  );
}
