'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, Panel, ErrorState } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canSeeAdmin, normalizeRole } from '@/lib/role-matrix';
import { LocaleSwitcher } from '@/components/shell/LocaleSwitcher';
import styles from './page.module.css';

/**
 * Settings page — view-designs.md §10.
 * Route-guarded: canSeeAdmin(role) check (CON-6, presentation-only; server enforces).
 * Organization panel: read-only tenant name + document locale from getTenantSettings.
 * My Profile panel: mounts LocaleSwitcher (one component, two mounts — §10).
 */

interface TenantSettings {
  tenantName: string;
  documentLocale: string;
}

const GET_TENANT_SETTINGS = `query GetTenantSettings {
  getTenantSettings { tenantName documentLocale }
}`;

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { user } = useAuth();
  const { query } = useGraphQL();

  const role = user?.role ?? 'employee';
  const canSeeSettings = canSeeAdmin(normalizeRole(role));

  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setError(false);
      setLoading(true);
      const data = await query<{ getTenantSettings: TenantSettings }>(GET_TENANT_SETTINGS);
      setSettings(data.getTenantSettings);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // Don't fetch for roles that can never see the result (CON-6 presentation-only gating)
    if (canSeeSettings) {
      fetchSettings();
    }
  }, [fetchSettings, canSeeSettings]);

  if (!canSeeSettings) {
    return null;
  }

  if (error && !loading) {
    return <ErrorState onRetry={fetchSettings} />;
  }

  return (
    <>
      <PageHeader title={t('title')} />

      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : (
        <div className={styles.panels}>
          {/* Organization panel — read-only */}
          <Panel title={t('organizationTitle')}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('tenantName')}</span>
              <span className={styles.fieldValue}>{settings?.tenantName}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('tenantLocale')}</span>
              <span className={styles.fieldValue}>{settings?.documentLocale.toUpperCase()}</span>
            </div>
            <p className={styles.readOnlyNote}>{t('tenantLocaleReadOnly')}</p>
          </Panel>

          {/* My Profile panel — per-user locale via LocaleSwitcher */}
          <Panel title={t('myProfileTitle')}>
            <LocaleSwitcher />
          </Panel>
        </div>
      )}
    </>
  );
}
