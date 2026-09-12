import type { Metadata } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const ui = Inter({ variable: '--font-ui', subsets: ['latin'], display: 'swap' });
const display = Source_Serif_4({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'History Demystified',
  description:
    'Explains a historical person, period, conflict or event to someone new to it, with every claim traceable to a source span you can click and check.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
