import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read our terms of service and conditions.',
};

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl prose prose-neutral dark:prose-invert">
      <h1 className="text-4xl font-bold tracking-tight mb-8">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last Updated: July 2026</p>
      
      <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
      <p>
        By accessing and using Ecomiq, you accept and agree to be bound by the terms and provision of this agreement.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">2. Use License</h2>
      <p>
        Permission is granted to temporarily download one copy of the materials (information or software) on Ecomiq's website for personal, non-commercial transitory viewing only.
      </p>

      <h2 className="text-2xl font-semibold mt-8 mb-4">3. Disclaimer</h2>
      <p>
        The materials on Ecomiq's website are provided on an 'as is' basis. Ecomiq makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
      </p>
    </div>
  );
}
