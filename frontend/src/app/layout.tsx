import { NextIntlClientProvider } from 'next-intl';
import messages from '../../messages/en.json';

export const metadata = {
  title: 'Cumplify',
  description: 'AI-powered Integrated Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
