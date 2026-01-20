import React from 'react';
import { X } from 'lucide-react';
import { trpc } from '../../utils/trpc';

interface NarrativeModalProps {
  narrativeId: string;
  onClose: () => void;
}

export function NarrativeModal({ narrativeId, onClose }: NarrativeModalProps) {
  // Fetch specific narrative details (You might need to add getById to your router if missing)
  // For now, we assume we might query the feed or a specific endpoint
  const { data, isLoading } = trpc.article.getInFocusFeed.useQuery(); 
  
  // Find the specific narrative from the cached feed or fetch individual if endpoint exists
  const narrative = data?.find(n => n.id === narrativeId);

  if (!narrative) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in slide-in-from-bottom-10">
      <div className="w-full h-[90vh] sm:h-auto sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header Image */}
        <div className="relative h-64 shrink-0">
          <img 
            src={narrative.imageUrl || ''} 
            className="w-full h-full object-cover"
            alt={narrative.headline}
          />
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
          >
            <X size={20} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
            <h2 className="text-2xl font-bold text-white leading-tight">{narrative.headline}</h2>
          </div>
        </div>

        {/* Content Scroll */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="prose dark:prose-invert max-w-none">
            <h3 className="text-purple-600 font-semibold mb-2">Key Findings</h3>
            <ul className="list-disc pl-5 space-y-2 mb-6">
              {narrative.keyFindings?.map((finding: string, i: number) => (
                <li key={i}>{finding}</li>
              ))}
            </ul>

            <h3 className="text-blue-600 font-semibold mb-2">Full Summary</h3>
            <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {narrative.summary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
