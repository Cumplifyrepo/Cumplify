'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { PrimaryButton } from '@/components/shared';
import Image from 'next/image';
import styles from './page.module.css';

/**
 * Sign-in page — §3: minimal dark card (logo, email, password, PrimaryButton)
 * at /sign-in. Pool B SRP-only (CON-2). Pool A is NEVER offered (BC-6/ACC-8).
 * m4 fix: maps auth failures to localized shell.signInError; uses PrimaryButton.
 */
export default function SignInPage() {
  const t = useTranslations('shell');
  const { signIn, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // m4: always show localized error, never raw Amplify error text
      setError(t('signInError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <Image
          src="/brand/cumplify-logo.png"
          alt="Cumplify"
          width={140}
          height={50}
          priority
          className={styles.logo}
        />
        <label htmlFor="email" className={styles.label}>
          {t('email')}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={styles.input}
          required
          autoComplete="email"
        />
        <label htmlFor="password" className={styles.label}>
          {t('password')}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={styles.input}
          required
          autoComplete="current-password"
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={submitting} className={styles.submitBtn}>
          {submitting ? t('signingIn') : t('signIn')}
        </PrimaryButton>
      </form>
    </div>
  );
}
