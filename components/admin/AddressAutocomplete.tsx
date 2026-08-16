'use client';

import { useState, useRef, useEffect } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Address',
  className = '',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Simple autocomplete using UK postcode districts and common areas
    // In production, integrate with Google Places API or similar
    const ukAreas = [
      'London',
      'Manchester',
      'Birmingham',
      'Leeds',
      'Glasgow',
      'Liverpool',
      'Newcastle',
      'Sheffield',
      'Bristol',
      'Edinburgh',
      'E14 0DX',
      'SE8 5AH',
      'SW14 8QX',
    ];

    const matches = ukAreas.filter((area) =>
      area.toLowerCase().includes(value.toLowerCase())
    );

    setSuggestions(matches.slice(0, 5));
    setShowSuggestions(matches.length > 0);
  }, [value]);

  const handleSelectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.trim() && suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        className={className}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-10 mt-xs bg-white border border-neutral-300 rounded-lg shadow-lg">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onMouseDown={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-md py-sm hover:bg-neutral-100 text-sm text-neutral-700 border-b border-neutral-200 last:border-b-0"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
