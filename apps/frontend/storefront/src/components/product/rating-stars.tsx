import { Star, StarHalf } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  rating: number;
  count?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function RatingStars({ rating, count, className, size = 'md' }: RatingStarsProps) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const starSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };
  
  const iconClass = cn(starSizes[size], "text-primary");

  return (
    <div className={cn("flex items-center space-x-1", className)}>
      <div className="flex items-center">
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star key={`full-${i}`} className={cn(iconClass, "fill-primary")} />
        ))}
        {hasHalfStar && <StarHalf className={cn(iconClass, "fill-primary")} />}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star key={`empty-${i}`} className={cn(iconClass, "text-muted")} />
        ))}
      </div>
      
      {count !== undefined && (
        <span className="text-sm text-muted-foreground ml-2">
          {rating > 0 ? rating.toFixed(1) : 'No reviews'} {count > 0 ? `(${count})` : ''}
        </span>
      )}
    </div>
  );
}
