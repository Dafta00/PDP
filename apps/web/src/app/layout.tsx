import type { Metadata } from 'next';
import { Lexend, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { QueryProvider } from '@/lib/query-provider';
import { ToastProvider } from '@/lib/toast-context';

// Corporate Trust pairing: Lexend for headings (built for reading clarity),
// Source Sans 3 for body/table/nav text — matched to enterprise/government/
// accessibility-focused products.
const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});
const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PDP Gombe State Management Platform',
  description: 'Membership & administrative management platform for PDP Gombe State.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lexend.variable} ${sourceSans.variable}`}>
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
