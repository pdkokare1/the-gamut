import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  className?: string;
}

export function CategoryPills({
  categories,
  selectedCategory,
  onSelectCategory,
  className,
}: CategoryPillsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected category
  useEffect(() => {
    if (scrollRef.current) {
      const selectedEl = scrollRef.current.querySelector(
        `[data-category="${selectedCategory}"]`
      ) as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [selectedCategory]);

  return (
    <div className={cn("relative group", className)}>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-2 py-3 px-4 no-scrollbar scroll-smooth mask-linear-fade"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none", 
          WebkitOverflowScrolling: "touch",
        }}
      >
        {categories.map((category) => {
          const isSelected = selectedCategory === category;
          return (
            <motion.button
              key={category}
              data-category={category}
              onClick={() => onSelectCategory(category)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 border",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
              )}
            >
              {category}
            </motion.button>
          );
        })}
      </div>
      
      {/* Gradient Fade Hints (Optional visual flair) */}
      <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-background to-transparent pointer-events-none" />
    </div>
  );
}
