// apps/web/src/pages/EmergencyPage.tsx
import { useState } from 'react';
import { trpc } from '../utils/trpc';
import { 
    Phone, Search, Shield, Flame, 
    Ambulance, Siren, Train, Navigation, 
    MapPin, AlertCircle, Loader2 
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';

export function EmergencyPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch data
  const { data: contacts, isLoading } = trpc.emergency.getAll.useQuery(undefined, {
      staleTime: Infinity // Static data rarely changes
  });

  const criticalContacts = [
    { name: 'Police', number: '100', icon: <Shield className="h-6 w-6 text-blue-500" /> },
    { name: 'Ambulance', number: '108', icon: <Ambulance className="h-6 w-6 text-red-500" /> },
    { name: 'Fire', number: '101', icon: <Flame className="h-6 w-6 text-orange-500" /> },
    { name: 'Women Helpline', number: '1091', icon: <Siren className="h-6 w-6 text-pink-500" /> },
    { name: 'Highway', number: '1033', icon: <Navigation className="h-6 w-6 text-yellow-500" /> },
    { name: 'Railway', number: '139', icon: <Train className="h-6 w-6 text-indigo-500" /> },
  ];

  // Filtering
  const filteredContacts = contacts?.filter(c => 
      c.serviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.number.includes(searchTerm) ||
      (c.scope && c.scope.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  return (
    <div className="container max-w-2xl mx-auto px-4 py-6 space-y-8 pb-24">
      
      {/* HEADER */}
      <div className="text-center space-y-2">
         <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
         </div>
         <h1 className="text-2xl font-bold tracking-tight">Emergency Resources</h1>
         <p className="text-muted-foreground text-sm">Tap any card to call instantly.</p>
      </div>

      {/* CRITICAL GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {criticalContacts.map((c) => (
              <a href={`tel:${c.number}`} key={c.name} className="no-underline">
                  <div className="flex flex-col items-center justify-center p-4 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                      <div className="mb-2 p-2 bg-muted/50 rounded-full">
                          {c.icon}
                      </div>
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs font-bold text-red-600 mt-1">{c.number}</span>
                  </div>
              </a>
          ))}
      </div>

      {/* SEARCH */}
      <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
              placeholder="Search by service, city, or number..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-muted/30"
          />
      </div>

      {/* RESULTS LIST */}
      {isLoading ? (
          <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-muted-foreground" />
          </div>
      ) : (
          <div className="space-y-4">
              {filteredContacts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No contacts found.</p>
              ) : (
                  filteredContacts.map((contact, idx) => (
                      <Card key={idx} className="overflow-hidden">
                          <CardContent className="p-4">
                              <div className="flex justify-between items-start gap-4">
                                  <div className="space-y-1">
                                      <h3 className="font-semibold text-base">{contact.serviceName}</h3>
                                      <p className="text-xs text-muted-foreground">{contact.description}</p>
                                      <div className="flex flex-wrap gap-2 mt-2">
                                          <Badge variant="outline" className="text-[10px] h-5">{contact.scope}</Badge>
                                          <Badge variant="secondary" className="text-[10px] h-5">{contact.category}</Badge>
                                      </div>
                                  </div>
                                  
                                  <div className="flex flex-col gap-2 shrink-0">
                                      {/* Handle multiple numbers (e.g., "100 or 112") */}
                                      {contact.number.split(/[\/,o]+r/).map((numRaw) => {
                                          const num = numRaw.trim();
                                          if (!num) return null;
                                          return (
                                              <a href={`tel:${num}`} key={num}>
                                                  <Button size="sm" className="w-full gap-2 bg-green-600 hover:bg-green-700 h-8 text-xs">
                                                      <Phone className="w-3 h-3" />
                                                      {num}
                                                  </Button>
                                              </a>
                                          );
                                      })}
                                  </div>
                              </div>
                          </CardContent>
                      </Card>
                  ))
              )}
          </div>
      )}
    </div>
  );
}
