import { trpc } from "../utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Phone, Globe, Clock, ShieldAlert } from "lucide-react";

export function EmergencyPage() {
  const { data: contacts, isLoading } = trpc.emergency.getAll.useQuery({ country: 'India' });

  if (isLoading) return <div className="p-4 text-center">Loading critical resources...</div>;

  return (
    <div className="container mx-auto p-4 max-w-2xl space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-red-100 rounded-full text-red-600">
          <ShieldAlert size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Emergency Resources</h1>
          <p className="text-slate-500">Verified 24/7 help lines and services.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {contacts?.map((contact) => (
          <Card key={contact.id} className="border-l-4 border-l-red-500 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold">{contact.serviceName}</CardTitle>
                  <p className="text-sm text-slate-500 uppercase tracking-wider font-semibold mt-1">
                    {contact.category}
                  </p>
                </div>
                {contact.isGlobal && (
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium flex items-center">
                    <Globe size={12} className="mr-1" /> Global
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 mb-4 text-sm">{contact.description}</p>
              
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center text-xs text-slate-400">
                  <Clock size={14} className="mr-1" />
                  {contact.hours}
                </div>
                <Button 
                  size="lg" 
                  variant="destructive"
                  className="rounded-full shadow-md"
                  onClick={() => window.open(`tel:${contact.number}`)}
                >
                  <Phone size={18} className="mr-2" />
                  Call {contact.number}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!isLoading && contacts?.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            No emergency contacts found for this region.
          </div>
        )}
      </div>
    </div>
  );
}
