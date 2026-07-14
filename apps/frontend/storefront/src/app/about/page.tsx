import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn more about Ecomiq.',
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl prose prose-neutral dark:prose-invert">
      <h1 className="text-4xl font-bold tracking-tight mb-8">About Ecomiq</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Ecomiq is a modern, headless commerce storefront designed for speed, flexibility, and a superior customer experience.
      </p>
      <h2 className="text-2xl font-semibold mt-8 mb-4">Our Mission</h2>
      <p>
        We believe that online shopping should be fast, intuitive, and accessible to everyone. 
        Our platform is built with the latest web technologies to ensure a seamless journey from discovery to checkout.
      </p>
      <h2 className="text-2xl font-semibold mt-8 mb-4">Technology Stack</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Next.js App Router:</strong> For server-side rendering, routing, and optimal performance.</li>
        <li><strong>Tailwind CSS & shadcn/ui:</strong> For a beautiful, responsive, and accessible design system.</li>
        <li><strong>BFF Architecture:</strong> A secure API gateway pattern bridging the storefront and backend services.</li>
      </ul>
    </div>
  );
}
