import { AmplifyProvider } from '@/lib/amplify-provider';
import { AuthProvider } from '@/lib/auth-context';
import { LocaleProvider } from '@/lib/locale-provider';
import './globals.css';

export const metadata = {
  title: 'Cumplify',
  description: 'AI-powered Integrated Management System',
};

/**
 * Root layout — static export (CON-3: output:'export').
 * Amplify → Auth → Locale providers wrap the entire app.
 * B2: LocaleProvider is inside AuthProvider so it reads user.locale and keys
 * NextIntlClientProvider on the active locale (ACC-5 re-render on switch).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AmplifyProvider>
          <AuthProvider>
            <LocaleProvider>{children}</LocaleProvider>
          </AuthProvider>
        </AmplifyProvider>
      </body>
    </html>
  );
}
