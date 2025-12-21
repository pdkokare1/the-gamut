import { useParams } from "react-router-dom";
import { trpc } from "../utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ArrowLeft, BookOpen, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function NarrativePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  // Convert string ID to number for the API
  const clusterId = parseInt(id || "0");
  
  const { data: narrative, isLoading } = trpc.narrative.getByClusterId.useQuery(
    { clusterId },
    { enabled: !!clusterId }
  );

  if (isLoading) return <div className="p-8 text-center">Loading comprehensive analysis...</div>;
  if (!narrative) return <div className="p-8 text-center">Narrative not found.</div>;

  return (
    <div className="container mx-auto max-w-3xl pb-20">
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b border-slate-100 p-4 flex items-center mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
          <ArrowLeft size={20} />
        </Button>
        <h2 className="font-semibold text-lg truncate">Deep Dive</h2>
      </div>

      <div className="px-4 space-y-6">
        {/* Main Header */}
        <div>
           <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100">
               <Layers size={12} className="mr-1" />
               Cluster #{narrative.clusterId}
            </Badge>
            <Badge variant="outline">{narrative.category}</Badge>
            <span className="text-xs text-slate-400 flex items-center ml-auto">
                {narrative.sourceCount} Sources Analyzed
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 leading-tight mb-4">
            {narrative.masterHeadline}
          </h1>
        </div>

        {/* Executive Summary Card */}
        <Card className="bg-slate-50 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center text-slate-800">
              <BookOpen size={18} className="mr-2 text-indigo-600" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 leading-relaxed text-lg">
              {narrative.executiveSummary}
            </p>
          </CardContent>
        </Card>

        {/* Key Consensus Points */}
        {narrative.consensusPoints && narrative.consensusPoints.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-lg">Key Findings</h3>
            <ul className="space-y-2">
              {narrative.consensusPoints.map((point, idx) => (
                <li key={idx} className="flex items-start bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-slate-700 text-sm font-medium">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Underlying Articles */}
        <div className="pt-6">
          <h3 className="font-bold text-slate-900 text-lg mb-4">Coverage Timeline</h3>
          <div className="border-l-2 border-slate-200 pl-4 space-y-6">
            {narrative.articles?.map((article) => (
              <div key={article.id} className="relative">
                <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-slate-300 border-2 border-white"></div>
                <div className="text-xs text-slate-400 mb-1">
                  {new Date(article.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {article.source}
                </div>
                <h4 className="font-medium text-slate-800 mb-1 leading-snug">
                  {article.headline}
                </h4>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                    {article.sentiment}
                  </Badge>
                  {article.biasScore > 0 && (
                     <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-orange-200 text-orange-700 bg-orange-50">
                        {Math.round(article.biasScore)}% Bias
                     </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
