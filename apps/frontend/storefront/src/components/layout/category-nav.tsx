import Link from 'next/link';

export function CategoryNav() {
  // In a real implementation, this would fetch from /api/catalog/storefront/categories
  // For now, we render a static/placeholder list to fulfill the shell requirement
  return (
    <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
      <Link href="/products" className="transition-colors hover:text-foreground/80 text-foreground/60">
        All Products
      </Link>
      <Link href="/markets" className="transition-colors hover:text-foreground/80 text-foreground/60">
        Markets
      </Link>
    </nav>
  );
}
