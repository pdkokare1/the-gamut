import { trpc } from "../utils/trpc";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function NarrativeList() {
  const { data: narratives, isLoading } = trpc.narrative.getTop.useQuery({ limit: 5 });

  if (isLoading) return <div className="h-40 bg-slate-100 animate-pulse rounded-xl mb-6 mx-4"></div>;
  
  if (!narratives || narratives.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center">
          <Sparkles size={16} className="text-indigo-500 mr-2" />
          Developing Stories
        </h2>
      </div>
      
      {/* Horizontal Scroll Container */}
      <div className="flex overflow-x-auto px-4 gap-3 pb-4 scrollbar-hide snap-x">
        {narratives.map((item) => (
          <Link to={`/narrative/${item.clusterId}`} key={item.id} className="snap-center">
            <Card className="w-72 flex-shrink-0 h-full hover:shadow-md transition-shadow cursor-pointer border-indigo-100">
              <CardContent className="p-4 flex flex-col h-full justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="text-[10px] font-bold tracking-wider">
                      {item.category?.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-medium">
                        {item.sourceCount} Sources
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 leading-snug line-clamp-3 mb-2">
                    {item.masterHeadline}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {item.executiveSummary}
                  </p>
                </div>
                
                <div className="mt-4 flex items-center text-indigo-600 text-xs font-bold">
                  Read Analysis <ArrowRight size={12} className="ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
