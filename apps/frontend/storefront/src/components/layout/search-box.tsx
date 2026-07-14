'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

function SearchBoxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    } else {
      router.push(`/products`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-sm">
      <Input
        type="search"
        placeholder="Search products..."
        className="pr-10"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button 
        type="submit" 
        className="absolute right-0 top-0 h-full px-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Search className="w-4 h-4" />
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}

export function SearchBox() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm h-10 bg-muted rounded-md animate-pulse" />}>
      <SearchBoxContent />
    </Suspense>
  );
}
