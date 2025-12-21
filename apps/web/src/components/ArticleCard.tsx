import { PlayCircle } from "lucide-react";
import { Card, CardContent, CardFooter } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useAudio } from "../context/AudioContext";
import { Link } from "react-router-dom";

interface ArticleCardProps {
  article: {
    id: string;
    headline: string;
    summary: string;
    source: string;
    publishedAt: string | Date;
    imageUrl?: string | null;
    audioUrl?: string | null;
    category: string;
    sentiment?: string;
  };
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { playTrack, currentTrack, isPlaying } = useAudio();
  const isCurrent = currentTrack?.id === article.id;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    if (article.audioUrl) {
        playTrack({
            id: article.id,
            url: article.audioUrl,
            title: article.headline,
            author: article.source,
            imageUrl: article.imageUrl || undefined
        });
    }
  };

  return (
    <Link to={`/narrative/${article.id}`}>
        <Card className="overflow-hidden hover:shadow-md transition-shadow h-full flex flex-col">
        {article.imageUrl && (
            <div className="relative h-48 w-full">
            <img 
                src={article.imageUrl} 
                alt="" 
                className="w-full h-full object-cover"
            />
            {article.audioUrl && (
                <button 
                    onClick={handlePlay}
                    className="absolute bottom-3 right-3 bg-white/90 text-indigo-600 p-2 rounded-full shadow-lg hover:bg-indigo-600 hover:text-white transition-colors"
                >
                    {isCurrent && isPlaying ? <div className="animate-pulse w-5 h-5 bg-current rounded-full" /> : <PlayCircle size={24} />}
                </button>
            )}
            </div>
        )}
        
        <CardContent className="p-4 flex-1">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs text-slate-500 font-medium">{article.source}</span>
                <span className="text-[10px] text-slate-400">{new Date(article.publishedAt).toLocaleDateString()}</span>
            </div>
            
            <h3 className="font-bold text-lg leading-tight mb-2 text-slate-900">
                {article.headline}
            </h3>
            
            <p className="text-sm text-slate-600 line-clamp-3">
                {article.summary}
            </p>
        </CardContent>

        <CardFooter className="p-4 pt-0 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between mt-auto">
            <Badge variant="outline" className="text-[10px] font-normal">
                {article.category}
            </Badge>
            {article.sentiment && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    article.sentiment === 'Positive' ? 'bg-green-100 text-green-700' :
                    article.sentiment === 'Negative' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600'
                }`}>
                    {article.sentiment}
                </span>
            )}
        </CardFooter>
        </Card>
    </Link>
  );
}
