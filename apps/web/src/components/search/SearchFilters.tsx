import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { 
  SORT_OPTIONS, CATEGORIES, LEANS, REGIONS, ARTICLE_TYPES 
} from '@/lib/constants';

// Define the shape of our filters
export interface SearchFiltersState {
  sort: string;
  category: string;
  lean: string;
  region: string;
  type: string;
}

interface SearchFiltersProps {
  filters: SearchFiltersState;
  onChange: (newFilters: SearchFiltersState) => void;
  onClose: () => void;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({ filters, onChange, onClose }) => {
  
  const updateFilter = (key: keyof SearchFiltersState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const resetFilters = () => {
    onChange({
      sort: 'latest',
      category: 'All Categories',
      lean: 'All Leans',
      region: 'Global',
      type: 'All Types'
    });
  };

  // Helper to render a native select for simplicity & mobile-friendliness
  // (You can upgrade this to Radix UI Select later for custom styling)
  const FilterSelect = ({ label, value, options, field }: { label: string, value: string, options: string[] | {value: string, label: string}[], field: keyof SearchFiltersState }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      <select 
        value={value}
        onChange={(e) => updateFilter(field, e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lab = typeof opt === 'string' ? opt : opt.label;
            return <option key={val} value={val}>{lab}</option>;
        })}
      </select>
    </div>
  );

  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-5 space-y-5 animate-in slide-in-from-top-2 duration-300">
      
      {/* Header */}
      <div className="flex justify-between items-center">
         <h3 className="font-semibold text-sm flex items-center gap-2">
            Filter Results
            {/* Show dot if filters are changed */}
            {filters.category !== 'All Categories' && <span className="h-2 w-2 rounded-full bg-primary" />}
         </h3>
         <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-muted-foreground hover:text-foreground">
                Reset
             </Button>
             <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
             </Button>
         </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FilterSelect label="Sort By" field="sort" value={filters.sort} options={SORT_OPTIONS} />
          <FilterSelect label="Category" field="category" value={filters.category} options={CATEGORIES} />
          <FilterSelect label="Political Lean" field="lean" value={filters.lean} options={LEANS} />
          <FilterSelect label="Region" field="region" value={filters.region} options={REGIONS} />
          <FilterSelect label="Content Type" field="type" value={filters.type} options={ARTICLE_TYPES} />
      </div>

    </div>
  );
};
