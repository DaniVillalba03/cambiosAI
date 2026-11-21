import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif', weight: ['500', '600'] });

export const metadata: Metadata = {
  title: 'MiCambio · Caja y divisas',
  description: 'Control de caja, bancos y divisas para el cambista. Registro por WhatsApp o desde la web.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MiCambio',
  },
};

// Se permite hacer zoom: importante para leer cómodo en el celular
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f4ef',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${serif.variable} font-sans`}>{children}</body>
    </html>
  );
}
