import '@mantine/core/styles.css';
import { ColorSchemeScript, MantineProvider, createTheme } from '@mantine/core';
import type { Metadata } from 'next';

const theme = createTheme({
  primaryColor: 'teal',
  fontFamily: 'var(--font-body)',
  headings: { fontFamily: 'var(--font-display)' },
});

export const metadata: Metadata = {
  title: 'OcularYB — Panel de Gestión',
  description: 'Dashboard de gestión para clínica oftalmológica OcularYB',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500&family=Work+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap" rel="stylesheet" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
