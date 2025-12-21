import { trpc } from "../utils/trpc";
import { auth } from "../lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, LogIn, Trophy, Flame, BookOpen } from "lucide-react";

export function ProfilePage() {
  const [user, loading] = useAuthState(auth);

  // Fetch Profile Data (only if logged in)
  const { data: profile, isLoading: isProfileLoading } = trpc.profile.getMe.useQuery(
    undefined, 
    { enabled: !!user }
  );

  const login = () => signInWithPopup(auth, new GoogleAuthProvider());

  if (loading || (user && isProfileLoading)) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center px-4">
        <h2 className="text-2xl font-bold">Sign in to The Gamut</h2>
        <p className="text-muted-foreground">Track your reading, save articles, and get personalized briefs.</p>
        <Button onClick={login} size="lg">
          <LogIn className="mr-2 h-4 w-4" /> Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        {user.photoURL ? (
          <img src={user.photoURL} alt="Profile" className="h-16 w-16 rounded-full border-2 border-indigo-100" />
        ) : (
          <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl">
            {user.displayName?.[0] || 'U'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{profile?.username || user.displayName}</h1>
          <p className="text-slate-500 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-orange-50 border-orange-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center">
                <Flame size={14} className="mr-1" /> Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{profile?.currentStreak || 0} <span className="text-sm font-medium text-slate-500">Days</span></div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center">
                <BookOpen size={14} className="mr-1" /> Read
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{profile?.articlesViewedCount || 0} <span className="text-sm font-medium text-slate-500">Articles</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Badges Section (New) */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center">
            <Trophy size={18} className="mr-2 text-yellow-500" /> Achievements
        </h2>
        {profile?.badges && profile.badges.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.badges.map((badge) => (
                    <div key={badge.id} className="flex items-center p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                        <div className="text-2xl mr-3">{badge.icon}</div>
                        <div>
                            <div className="font-bold text-sm text-slate-800">{badge.label}</div>
                            <div className="text-xs text-slate-500">{badge.description}</div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-sm">
                Read more articles to unlock your first badge!
            </div>
        )}
      </div>

      {/* Saved Articles */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Saved Articles</h2>
        {(!profile?.savedArticles || profile.savedArticles.length === 0) ? (
          <p className="text-slate-500 text-sm italic">You haven't saved any articles yet.</p>
        ) : (
          <div className="grid gap-3">
            {profile.savedArticles.map((article) => (
              <Card key={article.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="p-4">
                  <div className="flex justify-between items-start gap-2">
                     <CardTitle className="text-sm font-bold leading-snug">{article.headline}</CardTitle>
                     <Badge variant="secondary" className="text-[10px] shrink-0">{article.source}</Badge>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Button variant="outline" onClick={() => auth.signOut()} className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100">
        Sign Out
      </Button>
    </div>
  );
}
