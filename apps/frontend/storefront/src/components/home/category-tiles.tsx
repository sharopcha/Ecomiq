import Link from 'next/link';

export function CategoryTiles() {
  // Static configuration for now, or fetch from API
  const categories = [
    { id: '1', name: 'Electronics', slug: 'electronics', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=500&q=80' },
    { id: '2', name: 'Apparel', slug: 'apparel', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=500&q=80' },
    { id: '3', name: 'Home Goods', slug: 'home-goods', image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&q=80' },
    { id: '4', name: 'Beauty', slug: 'beauty', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=500&q=80' },
  ];

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl font-bold mb-6 tracking-tight">Shop by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {categories.map((cat) => (
            <Link 
              key={cat.id} 
              href={`/categories/${cat.id}`}
              className="group relative overflow-hidden rounded-xl aspect-[4/3] block"
            >
              <img 
                src={cat.image} 
                alt={cat.name} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <h3 className="text-white font-semibold text-lg text-center">{cat.name}</h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
