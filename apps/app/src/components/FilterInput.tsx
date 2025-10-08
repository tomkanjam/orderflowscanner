import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function FilterInput({
  value,
  onChange,
  placeholder = 'Search signals...',
}: FilterInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut: "/" to focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        // Only if not typing in another input
        if (document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
      // Escape to clear and blur
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onChange('');
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChange]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full h-10 pl-10 pr-10
          bg-background border border-border rounded-lg
          text-sm text-foreground placeholder:text-muted-foreground
          focus:outline-none focus:border-foreground
          transition-all duration-150
        "
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="
            absolute right-3 top-1/2 -translate-y-1/2
            text-muted-foreground hover:text-foreground
            transition-colors
          "
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
