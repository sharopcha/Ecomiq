'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function FiltersSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Local state for price inputs to avoid lag while typing
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') || '');

  // Sync state if URL changes externally
  useEffect(() => {
    setMinPrice(searchParams.get('minPrice') || '');
    setMaxPrice(searchParams.get('maxPrice') || '');
  }, [searchParams]);

  const updateFilters = useCallback((newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    
    // Reset to page 1 on filter change
    params.delete('page');
    
    router.push(`?${params.toString()}`);
  }, [searchParams, router]);

  const handlePriceApply = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
    });
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('minPrice');
    params.delete('maxPrice');
    params.delete('categoryId');
    params.delete('marketId');
    params.delete('page');
    router.push(`?${params.toString()}`);
  };

  const hasActiveFilters = searchParams.has('minPrice') || searchParams.has('maxPrice') || searchParams.has('categoryId') || searchParams.has('marketId');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-8 text-muted-foreground">
            Clear all
          </Button>
        )}
      </div>

      {/* Example category filter - would typically be dynamic */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm">Category</h4>
        <div className="space-y-2">
          {/* Mock categories for demo */}
          {['electronics', 'apparel', 'home-goods'].map((cat) => (
            <Label key={cat} className="flex items-center space-x-2 font-normal cursor-pointer">
              <input
                type="radio"
                name="categoryId"
                value={cat}
                checked={searchParams.get('categoryId') === cat}
                onChange={(e) => updateFilters({ categoryId: e.target.value })}
                className="rounded-full border-primary text-primary focus:ring-primary h-4 w-4"
              />
              <span className="capitalize">{cat.replace('-', ' ')}</span>
            </Label>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm">Price Range</h4>
        <form onSubmit={handlePriceApply} className="flex items-end gap-2">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="minPrice" className="text-xs text-muted-foreground">Min</Label>
            <Input 
              id="minPrice" 
              type="number" 
              min="0"
              placeholder="0" 
              value={minPrice} 
              onChange={(e) => setMinPrice(e.target.value)} 
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="maxPrice" className="text-xs text-muted-foreground">Max</Label>
            <Input 
              id="maxPrice" 
              type="number" 
              min="0"
              placeholder="1000" 
              value={maxPrice} 
              onChange={(e) => setMaxPrice(e.target.value)} 
            />
          </div>
          <Button type="submit" size="icon" variant="secondary" className="mb-0.5">
            &rarr;
          </Button>
        </form>
      </div>
    </div>
  );
}
