import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Helper for fallback images (preserved logic)
const getFallbackImage = (category?: string) => {
    // Return a placeholder service URL based on category
    return `https://source.unsplash.com/800x600/?${category || 'news'}`;
};

interface NarrativeCardProps {
  data: {
    id: string;
    masterHeadline: string;
    executiveSummary?: string;
    category?: string;
    lastUpdated?: Date | string;
    sourceCount?: number;
  };
  onClick: () => void;
}

const NarrativeCard: React.FC<NarrativeCardProps> = ({ data, onClick }) => {
  const displayDate = data.lastUpdated 
    ? formatDistanceToNow(new Date(data.lastUpdated), { addSuffix: true }) 
    : '';

  return (
    <Card 
        className="group relative overflow-hidden cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-purple-500"
        onClick={onClick}
    >
        <div className="flex flex-col sm:flex-row h-full">
            {/* Image Section */}
            <div className="sm:w-1/3 min-h-[160px] relative overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                    <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">
                        <Layers className="w-3 h-3 mr-1" />
                        Developing Narrative
                    </Badge>
                </div>
                <img 
                    src={getFallbackImage(data.category)} 
                    alt={data.masterHeadline}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
            </div>

            {/* Content Section */}
            <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">
                            {data.sourceCount || 0} Sources Analyzed
                        </span>
                        <span className="text-xs text-muted-foreground">{displayDate}</span>
                    </div>

                    <h3 className="text-lg font-serif font-bold leading-tight mb-2 group-hover:text-purple-700 transition-colors">
                        {data.masterHeadline}
                    </h3>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {data.executiveSummary || "AI Analysis in progress..."}
                    </p>
                </div>

                <div className="mt-4 flex justify-end">
                    <Button variant="link" className="text-purple-600 p-0 h-auto gap-1">
                        Open Briefing <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    </Card>
  );
};

export default NarrativeCard;
