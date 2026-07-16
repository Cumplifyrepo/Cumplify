'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  PageHeader,
  DataTable,
  StatusBadge,
  ClauseChip,
  ProvenanceLink,
  PrimaryButton,
  ErrorState,
  type Column,
} from '@/components/shared';
import { FormDrawer, type FieldDef } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import { DocumentDetail } from './_detail/DocumentDetail';
import styles from './page.module.css';

/**
 * M1 Document Studio list — view-designs.md §5.
 * Filter bar: standard pills + status select.
 * DataTable: Title, StatusBadge, ClauseChip, version, updatedAt w/ ProvenanceLink.
 * Ask chip consumes ?draft=1&title=<>&standard=<> (ASK-4).
 */

interface Document {
  id: string;
  standard: string;
  docType: string;
  title: string;
  status: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

const LIST_QUERY = `query ListDocs($standard: Standard, $status: DocumentStatus) {
  listDocuments(standard: $standard, status: $status) { id standard docType title status ownerId createdAt updatedAt }
}`;

const CREATE_MUTATION = `mutation CreateDraft($input: CreateDocumentDraftInput!) {
  createDocumentDraft(input: $input) { id standard docType title status }
}`;

const STANDARDS = ['', 'ISO9001', 'ISO14001', 'ISO45001'] as const;
const STATUSES = ['', 'DRAFT', 'IN_REVIEW', 'APPROVED', 'OBSOLETE'] as const;
const DOC_TYPES = ['MANUAL', 'PROCEDURE', 'WORK_INSTRUCTION', 'POLICY', 'SCOPE'] as const;

export default function M1ListPage() {
  const t = useTranslations('m1');
  const tStatus = useTranslations('status');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { query, mutate } = useGraphQL();

  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterStandard, setFilterStandard] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // G8: Read ?doc= param on mount for detail URL-sync
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) setSelectedId(docParam);
  }, [searchParams]);

  // Consume Ask chip params (?draft=1&title=<>&standard=<>)
  const chipTitle = searchParams.get('title') ?? '';
  const chipStandard = searchParams.get('standard') ?? '';
  const chipDraft = searchParams.get('draft') === '1';

  useEffect(() => {
    if (chipDraft) setDrawerOpen(true);
  }, [chipDraft]);

  const fetchDocs = useCallback(async () => {
    try {
      setError(false);
      const vars: Record<string, unknown> = {};
      if (filterStandard) vars.standard = filterStandard;
      if (filterStatus) vars.status = filterStatus;
      const data = await query<{ listDocuments: Document[] }>(LIST_QUERY, vars);
      setDocs(data.listDocuments);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, filterStandard, filterStatus]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Real-time: onDocumentStatusChanged patches list
  useTenantSubscription({
    query: `subscription OnDoc($tenantId: ID!) {
      onDocumentStatusChanged(tenantId: $tenantId) { id status standard }
    }`,
    onData: () => fetchDocs(),
  });

  const columns: Column<Document>[] = useMemo(
    () => [
      { key: 'title', header: t('colTitle'), render: (d) => d.title },
      { key: 'status', header: t('colStatus'), render: (d) => <StatusBadge status={d.status} /> },
      {
        key: 'standard',
        header: t('colStandard'),
        render: (d) => <ClauseChip standard={d.standard} clauseRef={null} />,
      },
      { key: 'docType', header: t('colType'), render: (d) => d.docType.replace(/_/g, ' ') },
      {
        key: 'updatedAt',
        header: t('colUpdated'),
        render: (d) => (
          <ProvenanceLink entityId={d.id}>
            {new Date(d.updatedAt).toLocaleDateString()}
          </ProvenanceLink>
        ),
      },
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
        name: 'docType',
        label: t('fieldDocType'),
        type: 'select',
        required: true,
        options: DOC_TYPES.map((dt) => ({ value: dt, label: dt.replace(/_/g, ' ') })),
      },
      {
        name: 'title',
        label: t('fieldTitle'),
        type: 'text',
        required: true,
        defaultValue: chipTitle,
      },
    ],
    [t, chipTitle, chipStandard],
  );

  async function handleCreate(values: Record<string, string | boolean>) {
    await mutate(CREATE_MUTATION, {
      input: { standard: values.standard, docType: values.docType, title: values.title },
    });
    fetchDocs();
  }

  // Show detail view when a doc is selected
  if (selectedId) {
    return (
      <DocumentDetail
        id={selectedId}
        onBack={() => {
          setSelectedId(null);
          router.replace('?', { scroll: false });
        }}
      />
    );
  }

  // G4: ErrorState with retry
  if (error && !loading) {
    return <ErrorState onRetry={fetchDocs} />;
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={<PrimaryButton onClick={() => setDrawerOpen(true)}>{t('newDraft')}</PrimaryButton>}
      />
      {/* Filter bar */}
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
          className={styles.statusSelect}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label={t('filterStatus')}
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? tStatus(s) : t('filterAll')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : (
        <DataTable
          columns={columns}
          data={docs}
          rowKey={(d) => d.id}
          onRowClick={(d) => {
            setSelectedId(d.id);
            router.replace(`?doc=${d.id}`, { scroll: false });
          }}
          emptyMessage={t('emptyList')}
        />
      )}

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('newDraft')}
        fields={drawerFields}
        onSubmit={handleCreate}
      />
    </>
  );
}
