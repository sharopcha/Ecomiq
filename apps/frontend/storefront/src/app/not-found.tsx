import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-4xl font-extrabold tracking-tight">404</h2>
      <h3 className="text-xl font-semibold">Page not found</h3>
      <p className="text-muted-foreground max-w-[500px]">
        Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/">Return to Home</Link>
      </Button>
    </div>
  );
}
