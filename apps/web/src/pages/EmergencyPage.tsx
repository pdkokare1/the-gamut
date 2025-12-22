import { useState } from 'react';
import { trpc } from '@/utils/trpc';
import { Phone, ExternalLink, Shield, HeartPulse, Scale, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function EmergencyPage() {
  const [search, setSearch] = useState('');
  
  // Fetch contacts from DB
  const { data: contacts, isLoading } = trpc.emergency.getAll.useQuery();

  const filteredContacts = contacts?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.description.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getIcon = (type: string) => {
    switch(type) {
      case 'Medical': return <HeartPulse className="h-5 w-5 text-red-500" />;
      case 'Legal': return <Scale className="h-5 w-5 text-blue-500" />;
      case 'Global': return <Globe className="h-5 w-5 text-purple-500" />;
      default: return <Shield className="h-5 w-5 text-green-500" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 fade-in">
      
      {/* Header */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center justify-center p-3 bg-red-500/10 rounded-full text-red-500 mb-4">
           <Shield className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-heading font-bold">Emergency Resources</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Verified contacts for medical, legal, and safety assistance. 
          If you are in immediate danger, please call your local emergency services (911) immediately.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mx-auto">
        <Input 
          placeholder="Search resources (e.g., 'Legal Aid', 'Mental Health')..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-secondary/50 border-transparent focus:border-primary"
        />
        <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
           [1,2,3,4].map(i => <div key={i} className="h-32 bg-muted/40 animate-pulse rounded-xl" />)
        ) : filteredContacts.length > 0 ? (
          filteredContacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                 <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                       {getIcon(contact.type)}
                       <CardTitle className="text-lg">{contact.name}</CardTitle>
                    </div>
                    <Badge variant="secondary">{contact.country}</Badge>
                 </div>
                 <CardDescription>{contact.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2 flex gap-3">
                 <Button className="flex-1" variant="default" asChild>
                    <a href={`tel:${contact.phone}`}>
                       <Phone className="mr-2 h-4 w-4" /> Call
                    </a>
                 </Button>
                 {contact.website && (
                   <Button className="flex-1" variant="outline" asChild>
                      <a href={contact.website} target="_blank" rel="noopener noreferrer">
                         <ExternalLink className="mr-2 h-4 w-4" /> Website
                      </a>
                   </Button>
                 )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-10 text-muted-foreground">
             No resources found matching "{search}".
          </div>
        )}
      </div>

    </div>
  );
}
