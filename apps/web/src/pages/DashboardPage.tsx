import { trpc } from '@/utils/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, BookOpen, Share2, Scale } from 'lucide-react';
import { BiasMap } from '@/components/visualizations/BiasMap';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

export function DashboardPage() {
  const { data: stats, isLoading } = trpc.stats.getDashboard.useQuery();
  const { data: digest } = trpc.stats.getWeeklyDigest.useQuery();

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

  // Transform Data for Recharts
  const activityData = stats?.dailyCounts?.map((d: any) => ({
      date: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
      count: d.count
  })) || [];

  const categoryData = stats?.categoryDistribution_read?.slice(0, 5) || [];

  return (
    <div className="space-y-6 pb-20 fade-in">
       
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold">My Dashboard</h1>
            <p className="text-muted-foreground">Insights into your reading habits and media diet.</p>
          </div>
          {digest && (
              <Badge variant={digest.status.includes('Bubble') ? 'destructive' : 'default'} className="text-sm px-3 py-1">
                  Weekly Status: {digest.status}
              </Badge>
          )}
       </div>

       {/* 1. Stat Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
             { label: 'Analyzed', val: stats?.totalCounts?.find((x:any) => x.action === 'view_analysis')?.count || 0, icon: TrendingUp },
             { label: 'Read', val: stats?.totalCounts?.find((x:any) => x.action === 'read_external')?.count || 0, icon: BookOpen },
             { label: 'Shared', val: stats?.totalCounts?.find((x:any) => x.action === 'share_article')?.count || 0, icon: Share2 },
             { label: 'Compared', val: stats?.totalCounts?.find((x:any) => x.action === 'view_comparison')?.count || 0, icon: Scale },
          ].map((stat, i) => (
             <Card key={i}>
                <CardContent className="p-6 flex items-center justify-between">
                   <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase">{stat.label}</p>
                      <p className="text-2xl font-bold">{stat.val}</p>
                   </div>
                   <stat.icon className="h-8 w-8 text-primary/20" />
                </CardContent>
             </Card>
          ))}
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* 2. Reading History (Line Chart) */}
          <Card className="col-span-1">
             <CardHeader>
                <CardTitle>Reading History</CardTitle>
                <CardDescription>Articles analyzed over the last 7 days</CardDescription>
             </CardHeader>
             <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={activityData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{r:4}} />
                   </LineChart>
                </ResponsiveContainer>
             </CardContent>
          </Card>

          {/* 3. Bias Map (New Visualization) */}
          <Card className="col-span-1">
             <CardHeader>
                <CardTitle>Bias vs. Reliability</CardTitle>
                <CardDescription>Where your content falls on the spectrum</CardDescription>
             </CardHeader>
             <CardContent className="h-[250px] flex items-center justify-center">
                 {/* Passing data to the new component */}
                 <BiasMap articles={stats?.allArticles || []} />
             </CardContent>
          </Card>

          {/* 4. Top Interests (Bar Chart) */}
          <Card className="col-span-1 lg:col-span-2">
             <CardHeader>
                <CardTitle>Top Interests</CardTitle>
             </CardHeader>
             <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={categoryData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="category" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: 'hsl(var(--card))' }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                   </BarChart>
                </ResponsiveContainer>
             </CardContent>
          </Card>

       </div>
    </div>
  );
}
