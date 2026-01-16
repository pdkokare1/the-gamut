import { useState } from 'react';
import { trpc } from '../utils/trpc';
import { useAuth } from '../context/AuthContext';
import { BadgeGrid } from '../components/profile/BadgeGrid';
import { FeedItem } from '../components/FeedItem';
import { Button } from '../components/ui/button';
import { Settings, Flame, BookOpen, ShieldCheck, Loader2, PieChart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ProfilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Fetch Profile Data (Auto-cached by React Query/TRPC)
  const { data: profile, isLoading } = trpc.profile.getMe.useQuery(undefined, {
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary h-8 w-8" />
      </div>
    );
  }

  if (!profile) return null;

  // Safely access nested objects
  const stats = profile.stats || { articlesViewed: 0, totalTimeSpent: 0 };
  const gamification = profile.gamification || { streak: 0, badges: [], level: 1 };

  return (
    <div className="space-y-6 fade-in animate-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* 1. HERO HEADER */}
      <section className="relative rounded-2xl overflow-hidden glass p-6 md:p-10 flex flex-col md:flex-row items-center gap-6 border-b-4 border-primary">
        
        {/* Avatar Ring */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)] p-1 bg-background">
             <img 
               src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profile.username}`} 
               alt="Avatar" 
               className="w-full h-full rounded-full object-cover"
             />
          </div>
          {/* Level Pill */}
          <div className="absolute -bottom-2 -right-2 bg-background p-1.5 rounded-full shadow-sm">
            <div className="bg-primary text-[10px] text-primary-foreground font-bold px-2 py-0.5 rounded-full">
              Lvl {gamification.level}
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <h1 className="text-3xl font-logo font-bold">{profile.username}</h1>
          <p className="text-muted-foreground text-sm">Member since {new Date(profile.createdAt || Date.now()).getFullYear()}</p>
          
          {/* Quick Stats Bar */}
          <div className="flex items-center justify-center md:justify-start gap-4 pt-2">
             <div className="flex items-center gap-1.5 bg-secondary/50 px-3 py-1 rounded-full border border-border">
               <Flame className="h-4 w-4 text-orange-500 fill-orange-500" />
               <span className="font-bold text-sm">{gamification.streak} Day Streak</span>
             </div>
             <div className="flex items-center gap-1.5 px-3 py-1 text-muted-foreground">
               <BookOpen className="h-3 w-3" />
               <span className="text-sm font-medium">{stats.articlesViewed} Reads</span>
             </div>
          </div>
        </div>

        {/* Settings Action */}
        <Link to="/settings">
          <Button variant="outline" size="icon" className="absolute top-4 right-4 md:static hover:border-primary">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 2. LEFT COLUMN: STATS & BADGES */}
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
            <div className="glass-card p-4 rounded-xl flex items-center gap-4 hover:bg-secondary/20 transition-colors">
              <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.articlesViewed}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Articles Read</p>
              </div>
            </div>

            <div className="glass-card p-4 rounded-xl flex items-center gap-4 hover:bg-secondary/20 transition-colors">
              <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.floor(stats.totalTimeSpent / 60)}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Minutes Read</p>
              </div>
            </div>
          </div>

          {/* Badges Module */}
          <div className="glass-card p-5 rounded-xl space-y-4">
            <h3 className="font-bold font-logo text-lg flex items-center gap-2">
              Achievements <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{gamification.badges.length}</span>
            </h3>
            {/* Using your existing BadgeGrid component */}
            <BadgeGrid earnedBadges={gamification.badges} />
          </div>
        </div>

        {/* 3. RIGHT COLUMN: CONTENT TABS */}
        <div className="md:col-span-2 space-y-6">
          {/* Simple Tab Switcher */}
          <div className="flex gap-2 border-b border-border pb-1">
            {['overview', 'saved'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-all border-b-2 ${
                  activeTab === tab 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {activeTab === 'overview' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                 {/* Here we can eventually plug in the BiasMap/Echo Chamber visual 
                     using stats.leanExposure 
                 */}
                 <div className="p-8 text-center text-muted-foreground border-2 border-dashed border-border/50 rounded-xl bg-secondary/5">
                   <p className="mb-2">Your reading insights and recommendations will appear here.</p>
                   <p className="text-xs text-muted-foreground/50">Read more articles to unlock detailed analysis.</p>
                 </div>
              </div>
            )}

            {activeTab === 'saved' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                {!profile.savedArticles || profile.savedArticles.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                    <p>No saved articles yet.</p>
                  </div>
                ) : (
                  profile.savedArticles.map((article: any) => (
                    <FeedItem key={article.id} article={article} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
