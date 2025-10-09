import React from 'react';

interface CategoryHeaderProps {
  category: string;
  count?: number;
}

export function CategoryHeader({ category, count }: CategoryHeaderProps) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-3 first:mt-0">
      <h4 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
        {category}
        {count !== undefined && <span className="ml-1.5 opacity-60">({count})</span>}
      </h4>
      <div className="flex-1 border-b border-border" />
    </div>
  );
}
