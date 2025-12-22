import { Shield, Phone, MessageSquare, LogOut, ExternalLink } from 'lucide-react';
import { Button } from '../components/ui/button';

export function EmergencyPage() {
  
  // Safety: Quick Exit Function
  const quickExit = () => {
    window.location.replace("https://www.google.com/search?q=weather");
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 fade-in pb-10">
      
      {/* 1. Header with Quick Exit */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-logo font-bold text-red-500 flex items-center gap-2">
            <Shield className="h-8 w-8" /> Crisis Resources
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Confidential help is available for free, 24/7.
          </p>
        </div>
        
        <Button 
          variant="destructive" 
          onClick={quickExit}
          className="shadow-lg animate-pulse hover:animate-none"
        >
          <LogOut className="h-4 w-4 mr-2" /> Quick Exit (ESC)
        </Button>
      </div>

      {/* 2. Primary Helplines */}
      <div className="grid gap-4">
        
        {/* Suicide Prevention */}
        <div className="glass-card p-6 rounded-xl border-l-4 border-l-blue-500 hover:bg-secondary/10 transition-colors">
          <h3 className="font-bold text-lg mb-1">Suicide & Crisis Lifeline</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Free and confidential support for people in distress.
          </p>
          <div className="flex gap-3">
            <a href="tel:988" className="flex-1">
              <Button className="w-full gap-2" variant="secondary">
                <Phone className="h-4 w-4" /> Call 988
              </Button>
            </a>
            <a href="sms:988" className="flex-1">
              <Button className="w-full gap-2" variant="outline">
                <MessageSquare className="h-4 w-4" /> Text 988
              </Button>
            </a>
          </div>
        </div>

        {/* Domestic Violence */}
        <div className="glass-card p-6 rounded-xl border-l-4 border-l-purple-500 hover:bg-secondary/10 transition-colors">
          <h3 className="font-bold text-lg mb-1">Domestic Violence Hotline</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Essential tools and support to help survivors of domestic violence.
          </p>
          <div className="flex gap-3">
            <a href="tel:18007997233" className="flex-1">
              <Button className="w-full gap-2" variant="secondary">
                <Phone className="h-4 w-4" /> 1-800-799-SAFE
              </Button>
            </a>
            <a href="https://www.thehotline.org/" target="_blank" rel="noreferrer" className="flex-1">
              <Button className="w-full gap-2" variant="outline">
                <ExternalLink className="h-4 w-4" /> Chat Online
              </Button>
            </a>
          </div>
        </div>

        {/* Trevor Project (LGBTQ) */}
        <div className="glass-card p-6 rounded-xl border-l-4 border-l-orange-500 hover:bg-secondary/10 transition-colors">
          <h3 className="font-bold text-lg mb-1">The Trevor Project</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crisis intervention and suicide prevention for LGBTQ youth.
          </p>
          <div className="flex gap-3">
            <a href="tel:18664887386" className="flex-1">
              <Button className="w-full gap-2" variant="secondary">
                <Phone className="h-4 w-4" /> Call Now
              </Button>
            </a>
          </div>
        </div>

      </div>

      {/* 3. Safety Notice */}
      <div className="bg-secondary/50 p-4 rounded-xl text-xs text-center text-muted-foreground">
        <p>
          Your browsing activity on this page is <strong>not</strong> tracked by our analytics system. 
          However, your browser history may still record this visit. 
          Use "Quick Exit" or Incognito mode if you are unsafe.
        </p>
      </div>

    </div>
  );
}
