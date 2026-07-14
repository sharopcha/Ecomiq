import ProductsPage from '../products/page';

export const dynamic = 'force-dynamic';

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // We reuse the exact same layout and logic as the products page,
  // as the filtering/sorting/search query params are handled uniformly.
  return <ProductsPage searchParams={searchParams} />;
}
