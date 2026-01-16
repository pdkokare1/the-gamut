import { trpc } from '../../utils/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SmartImage } from '../ui/SmartImage'; // Assuming you have this or use standard img
import { useNavigate } from 'react-router-dom';

interface CompareCoverageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentArticle: {
    id: string;
    clusterTopic?: string | null;
    category: string;
    politicalLean: string;
  };
}

export function CompareCoverageModal({ isOpen, onClose, currentArticle }: CompareCoverageModalProps) {
  const navigate = useNavigate();
  
  const { data: perspectives, isLoading } = trpc.article.getTopicPerspectives.useQuery(
    { 
      topic: currentArticle.clusterTopic, 
      category: currentArticle.category,
      currentArticleId: currentArticle.id 
    },
    { enabled: isOpen }
  );

  const handleRead = (id: string) => {
    onClose();
    navigate(`/narrative/${id}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Full Spectrum Coverage
          </DialogTitle>
          <DialogDescription>
            See how other sources are reporting on "{currentArticle.clusterTopic || 'this topic'}".
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="animate-spin w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* LEFT WING */}
            <PerspectiveCard 
                article={perspectives?.left} 
                lean="Left" 
                currentLean={currentArticle.politicalLean}
                onRead={handleRead}
            />

            {/* CENTER */}
            <PerspectiveCard 
                article={perspectives?.center} 
                lean="Center" 
                currentLean={currentArticle.politicalLean}
                onRead={handleRead}
            />

            {/* RIGHT WING */}
            <PerspectiveCard 
                article={perspectives?.right} 
                lean="Right" 
                currentLean={currentArticle.politicalLean}
                onRead={handleRead}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper Sub-component
function PerspectiveCard({ article, lean, currentLean, onRead }: any) {
    const isCurrent = lean === currentLean;
    const colorClass = lean === 'Left' ? 'border-blue-200 bg-blue-50/50 dark:bg-blue-900/10' : 
                       lean === 'Right' ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' : 
                       'border-gray-200 bg-gray-50/50 dark:bg-gray-900/10';
    
    const textClass = lean === 'Left' ? 'text-blue-700 dark:text-blue-300' : 
                      lean === 'Right' ? 'text-red-700 dark:text-red-300' : 
                      'text-gray-700 dark:text-gray-300';

    if (!article && !isCurrent) {
        return (
            <div className="h-40 border-2 border-dashed border-muted rounded-xl flex items-center justify-center text-muted-foreground text-xs text-center p-4">
                No {lean}-leaning coverage found yet.
            </div>
        );
    }

    if (isCurrent) {
        return (
             <div className="relative p-4 border-2 border-primary/20 rounded-xl bg-primary/5 flex flex-col items-center justify-center text-center space-y-2 opacity-75">
                <span className="text-xs font-bold uppercase tracking-wider bg-background px-2 py-1 rounded">You are here</span>
                <p className="font-semibold text-sm">Reading {lean} Perspective</p>
             </div>
        );
    }

    return (
        <div className={cn("relative flex flex-col rounded-xl border overflow-hidden transition-all hover:shadow-md", colorClass)}>
            <div className="h-32 w-full overflow-hidden bg-muted relative">
                 {/* Image would go here, using a simple div for now if SmartImage is not available */}
                 <img src={article.imageUrl || '/placeholder.jpg'} alt="cover" className="w-full h-full object-cover" />
                 <div className={cn("absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-background/90 backdrop-blur", textClass)}>
                    {lean}
                 </div>
            </div>
            
            <div className="p-4 flex flex-col flex-1">
                <div className="text-[10px] text-muted-foreground mb-1">{article.source}</div>
                <h4 className="font-bold text-sm leading-tight mb-3 line-clamp-3">{article.headline}</h4>
                
                <div className="mt-auto pt-2">
                    <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => onRead(article.id)}>
                        Read Perspective <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
