'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  ClauseChip,
  PrimaryButton,
  ErrorState,
  type Column,
} from '@/components/shared';
import { FormDrawer, type FieldDef } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import { NCDetail } from './_detail/NCDetail';
import styles from './page.module.css';

/**
 * M2 CAPA list — view-designs.md §6.
 * Two tabs: Nonconformities (default) + Open CAPAs.
 * Filter: standard + severity. Ask chip consumes ?raise=1&description=<>&standard=<>.
 * G1: NC tab wired to listNonconformities(standard, severity).
 * G4: ErrorState with retry on fetch failure.
 * G8: URL-param sync for detail: ?nc=<id>.
 */

interface Nonconformity {
  id: string;
  standard: string;
  source: string;
  ncType: string;
  description: string;
  clauseRef: string;
  severity: string;
  status: string;
  raisedBy: string;
  raisedAt: string;
}

interface CorrectiveAction {
  id: string;
  ncId: string;
  actionDesc: string;
  ownerId: string;
  dueDate: string;
  status: string;
  containmentFlag: boolean;
}

const LIST_NCS_QUERY = `query ListNCs($standard: Standard, $severity: Severity) {
  listNonconformities(standard: $standard, severity: $severity) { id standard source ncType description clauseRef severity status raisedBy raisedAt }
}`;

const OPEN_CAPAS_QUERY = `query OpenCAPAs($standard: Standard, $severity: Severity) {
  listOpenCAPAs(standard: $standard, severity: $severity) { id ncId actionDesc ownerId dueDate status containmentFlag }
}`;

const RAISE_NC_MUTATION = `mutation RaiseNC($input: RaiseNonconformityInput!) {
  raiseNonconformity(input: $input) { id standard description clauseRef severity status raisedAt }
}`;

const STANDARDS = ['', 'ISO9001', 'ISO14001', 'ISO45001'] as const;
const SEVERITIES = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const NC_SOURCES = ['AUDIT', 'INCIDENT', 'COMPLAINT', 'PROCESS'] as const;
const NC_TYPES = ['NC', 'NONCONFORMING_OUTPUT', 'INCIDENT'] as const;

export default function M2ListPage() {
  const t = useTranslations('m2');
  const tStatus = useTranslations('status');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { query, mutate } = useGraphQL();

  const [tab, setTab] = useState<'nc' | 'capa'>('nc');
  const [ncs, setNcs] = useState<Nonconformity[]>([]);
  const [capas, setCapas] = useState<CorrectiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterStandard, setFilterStandard] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNcId, setSelectedNcId] = useState<string | null>(null);

  // G8: Read ?nc= param on mount for detail URL-sync
  useEffect(() => {
    const ncParam = searchParams.get('nc');
    if (ncParam) setSelectedNcId(ncParam);
  }, [searchParams]);

  // Consume Ask chip params (?raise=1&description=<>&standard=<>)
  const chipDesc = searchParams.get('description') ?? '';
  const chipStandard = searchParams.get('standard') ?? '';
  const chipRaise = searchParams.get('raise') === '1';

  useEffect(() => {
    if (chipRaise) setDrawerOpen(true);
  }, [chipRaise]);

  const filterVars = useMemo(() => {
    const vars: Record<string, unknown> = {};
    if (filterStandard) vars.standard = filterStandard;
    if (filterSeverity) vars.severity = filterSeverity;
    return vars;
  }, [filterStandard, filterSeverity]);

  // G1: Fetch NC list with proper query and filters
  const fetchNCs = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{ listNonconformities: Nonconformity[] }>(
        LIST_NCS_QUERY,
        filterVars,
      );
      setNcs(data.listNonconformities);
    } catch {
      setError(true);
    }
  }, [query, filterVars]);

  const fetchCapas = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{ listOpenCAPAs: CorrectiveAction[] }>(OPEN_CAPAS_QUERY, filterVars);
      setCapas(data.listOpenCAPAs);
    } catch {
      setError(true);
    }
  }, [query, filterVars]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchNCs(), fetchCapas()]);
    setLoading(false);
  }, [fetchNCs, fetchCapas]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Single subscription refetches BOTH tabs
  useTenantSubscription({
    query: `subscription OnCAPA($tenantId: ID!) {
      onCAPAStatusChanged(tenantId: $tenantId) { id status }
    }`,
    onData: () => {
      fetchNCs();
      fetchCapas();
    },
  });

  const ncColumns: Column<Nonconformity>[] = useMemo(
    () => [
      { key: 'description', header: t('colDescription'), render: (nc) => nc.description },
      {
        key: 'severity',
        header: t('colSeverity'),
        render: (nc) => <StatusBadge status={nc.severity} />,
      },
      {
        key: 'standard',
        header: t('colStandard'),
        render: (nc) => <ClauseChip standard={nc.standard} clauseRef={nc.clauseRef} />,
      },
      {
        key: 'raisedAt',
        header: t('colRaisedAt'),
        render: (nc) => new Date(nc.raisedAt).toLocaleDateString(),
      },
      { key: 'status', header: t('colStatus'), render: (nc) => <StatusBadge status={nc.status} /> },
    ],
    [t],
  );

  const capaColumns: Column<CorrectiveAction>[] = useMemo(
    () => [
      { key: 'actionDesc', header: t('colAction'), render: (ca) => ca.actionDesc },
      { key: 'ownerId', header: t('colOwner'), render: (ca) => ca.ownerId },
      {
        key: 'dueDate',
        header: t('colDueDate'),
        render: (ca) => new Date(ca.dueDate).toLocaleDateString(),
      },
      { key: 'status', header: t('colStatus'), render: (ca) => <StatusBadge status={ca.status} /> },
    ],
    [t],
  );

  const drawerFields: FieldDef[] = useMemo(
    () => [
      {
        name: 'standard',
        label: t('fieldStandard'),
        type: 'select',
        required: true,
        options: STANDARDS.filter(Boolean).map((s) => ({
          value: s,
          label: s.replace('ISO', 'ISO '),
        })),
        defaultValue: chipStandard || '',
      },
      {
        name: 'source',
        label: t('fieldSource'),
        type: 'select',
        required: true,
        options: NC_SOURCES.map((s) => ({ value: s, label: s })),
      },
      {
        name: 'ncType',
        label: t('fieldNcType'),
        type: 'select',
        required: true,
        options: NC_TYPES.map((nt) => ({ value: nt, label: nt.replace(/_/g, ' ') })),
      },
      {
        name: 'description',
        label: t('fieldDescription'),
        type: 'textarea',
        required: true,
        defaultValue: chipDesc,
      },
      { name: 'clauseRef', label: t('fieldClauseRef'), type: 'text', required: true },
      {
        name: 'severity',
        label: t('fieldSeverity'),
        type: 'select',
        required: true,
        options: SEVERITIES.filter(Boolean).map((s) => ({ value: s, label: s })),
      },
    ],
    [t, chipDesc, chipStandard],
  );

  async function handleRaiseNC(values: Record<string, string | boolean>) {
    try {
      await mutate(RAISE_NC_MUTATION, {
        input: {
          standard: values.standard,
          source: values.source,
          ncType: values.ncType,
          description: values.description,
          clauseRef: values.clauseRef,
          severity: values.severity,
        },
      });
      // After raise succeeds, refetch NC list (not just CAPAs)
      await fetchNCs();
      await fetchCapas();
    } catch {
      setError(true);
    }
  }

  function handleSelectNC(nc: Nonconformity) {
    setSelectedNcId(nc.id);
    // G8: URL-param sync for detail
    router.replace(`?nc=${nc.id}`, { scroll: false });
  }

  function handleBackFromDetail() {
    setSelectedNcId(null);
    router.replace('?', { scroll: false });
  }

  // Show detail when NC selected
  if (selectedNcId) {
    return <NCDetail id={selectedNcId} onBack={handleBackFromDetail} />;
  }

  // G4: Error state with retry
  if (error && !loading) {
    return <ErrorState onRetry={fetchAll} />;
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={<PrimaryButton onClick={() => setDrawerOpen(true)}>{t('raiseNc')}</PrimaryButton>}
      />

      {/* Tab bar */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'nc' ? styles.tabActive : ''}`}
          onClick={() => setTab('nc')}
        >
          {t('tabNonconformities')}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'capa' ? styles.tabActive : ''}`}
          onClick={() => setTab('capa')}
        >
          {t('tabOpenCapas')}
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.pills}>
          {STANDARDS.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              className={`${styles.pill} ${filterStandard === s ? styles.pillActive : ''}`}
              onClick={() => setFilterStandard(s)}
            >
              {s ? s.replace('ISO', 'ISO ') : t('filterAll')}
            </button>
          ))}
        </div>
        <select
          className={styles.severitySelect}
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          aria-label={t('filterSeverity')}
        >
          {SEVERITIES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? tStatus(s) : t('filterAll')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : tab === 'nc' ? (
        <DataTable
          columns={ncColumns}
          data={ncs}
          rowKey={(nc) => nc.id}
          onRowClick={handleSelectNC}
          emptyMessage={t('emptyNcList')}
        />
      ) : (
        <DataTable
          columns={capaColumns}
          data={capas}
          rowKey={(ca) => ca.id}
          emptyMessage={t('emptyCapaList')}
        />
      )}

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('raiseNc')}
        fields={drawerFields}
        onSubmit={handleRaiseNC}
      />
    </>
  );
}
