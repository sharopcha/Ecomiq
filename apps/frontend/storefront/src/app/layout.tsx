import type { Metadata } from 'next';
import './global.css';
import { SessionProvider } from '@/components/providers/session-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import { CartProvider } from '@/components/cart/cart-context';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export const metadata: Metadata = {
  title: {
    template: '%s | Ecomiq',
    default: 'Ecomiq Storefront',
  },
  description: 'A modern, headless commerce storefront.',
  openGraph: {
    title: 'Ecomiq',
    description: 'A modern, headless commerce storefront.',
    url: 'https://ecomiq.dev',
    siteName: 'Ecomiq',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <QueryProvider>
            <CartProvider>
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1">
                  {children}
                </main>
                <Footer />
              </div>
              <CartDrawer />
              <Toaster />
            </CartProvider>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
