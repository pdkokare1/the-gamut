import { trpc } from "../utils/trpc";
import { auth } from "../lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth"; // We'll install this helper
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Loader2, LogIn } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <h2 className="text-2xl font-bold">Sign in to The Gamut</h2>
        <p className="text-muted-foreground">Track your reading, save articles, and get personalized briefs.</p>
        <Button onClick={login} size="lg">
          <LogIn className="mr-2 h-4 w-4" /> Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        {user.photoURL && (
          <img src={user.photoURL} alt="Profile" className="h-16 w-16 rounded-full border-2 border-primary" />
        )}
        <div>
          <h1 className="text-2xl font-bold">{profile?.username || user.displayName}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Read Streak</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{profile?.currentStreak || 0} Days</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Articles Read</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{profile?.articlesViewedCount || 0}</div></CardContent>
        </Card>
      </div>

      {/* Saved Articles */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Saved Articles</h2>
        {profile?.savedArticles.length === 0 ? (
          <p className="text-muted-foreground">You haven't saved any articles yet.</p>
        ) : (
          <div className="grid gap-4">
            {profile?.savedArticles.map((article) => (
              <Card key={article.id}>
                <CardHeader>
                  <CardTitle className="text-base">{article.headline}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Button variant="outline" onClick={() => auth.signOut()} className="w-full">
        Sign Out
      </Button>
    </div>
  );
}
