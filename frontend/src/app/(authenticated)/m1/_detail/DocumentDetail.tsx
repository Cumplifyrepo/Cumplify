'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  Panel,
  StatusBadge,
  ClauseChip,
  PrimaryButton,
  SecondaryButton,
  ProvenanceLink,
  ErrorState,
} from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { canApprove } from '@/lib/role-matrix';
import { DiffView } from '@/components/m1/DiffView';
import styles from './DocumentDetail.module.css';

/**
 * M1 Document detail — view-designs.md §5.
 * Header (title, StatusBadge, ClauseChip) + action row gated by status AND role.
 * Right rail: version history with compare selection.
 * G3: approveDocumentVersion/publishControlledDocument use a REAL versionId.
 * G4: all handlers wrapped in try/catch with error state.
 * G8: CSS modules, URL-param sync, success toast with ProvenanceLink.
 *
 * BLOCKED-ON-OWNER (§12): updatePolicy and updateImsScope drawers require
 * getPolicy/getImsScope queries to obtain the real row id (m1.policies and
 * m1.ims_scope are independent tables with own UUIDs — doc.id is NOT valid).
 * No read surface exists in the schema. Flagged, not coded around.
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

interface DocumentVersion {
  id: string;
  documentId: string;
  versionNo: number;
  contentRef: string;
  changeSummary: string;
  authorId: string;
  createdAt: string;
}

interface Diff {
  additions: number;
  deletions: number;
  content: string;
}

const GET_DOC = `query GetDoc($id: ID!) {
  getDocument(id: $id) { id standard docType title status ownerId createdAt updatedAt }
}`;

const LIST_VERSIONS = `query ListVersions($documentId: ID!) {
  listDocumentVersions(documentId: $documentId) { id documentId versionNo contentRef changeSummary authorId createdAt }
}`;

const SUBMIT_MUTATION = `mutation Submit($id: ID!) {
  submitDocumentForApproval(id: $id) { id status }
}`;

const APPROVE_MUTATION = `mutation Approve($input: ApproveDocumentVersionInput!) {
  approveDocumentVersion(input: $input) { id decision }
}`;

const PUBLISH_MUTATION = `mutation Publish($versionId: ID!) {
  publishControlledDocument(versionId: $versionId) { id status }
}`;

const DIFF_QUERY = `query Diff($v1: ID!, $v2: ID!) {
  getDocumentVersionDiff(v1: $v1, v2: $v2) { additions deletions content }
}`;

export function DocumentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useTranslations('m1');
  const router = useRouter();
  const { query, mutate } = useGraphQL();
  const { user } = useAuth();
  const role = user?.role ?? 'employee';

  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [toast, setToast] = useState<{ entityId: string } | null>(null);

  const canAct = canApprove(role, 'M1');

  // G8: URL-param sync
  useEffect(() => {
    router.replace(`?doc=${id}`, { scroll: false });
  }, [id, router]);

  const fetchDoc = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{ getDocument: Document }>(GET_DOC, { id });
      setDoc(data.getDocument);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, id]);

  const fetchVersions = useCallback(async () => {
    try {
      const data = await query<{ listDocumentVersions: DocumentVersion[] }>(LIST_VERSIONS, { documentId: id });
      setVersions(data.listDocumentVersions);
    } catch {
      // Non-critical — version rail stays empty
    }
  }, [query, id]);

  useEffect(() => {
    fetchDoc();
    fetchVersions();
  }, [fetchDoc, fetchVersions]);

  // Derive latest version for approve/publish (REAL version id, never doc.id)
  const latestVersion = useMemo(() => {
    if (versions.length === 0) return null;
    return [...versions].sort((a, b) => b.versionNo - a.versionNo)[0];
  }, [versions]);

  function showToast(entityId: string) {
    setToast({ entityId });
    setTimeout(() => setToast(null), 5000);
  }

  function handleVersionSelect(versionId: string) {
    setSelectedVersions((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((v) => v !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  }

  async function handleSubmit() {
    if (!doc) return;
    setActionLoading(true);
    try {
      const result = await mutate<{ submitDocumentForApproval: { id: string } }>(SUBMIT_MUTATION, { id: doc.id });
      showToast(result.submitDocumentForApproval.id);
      await fetchDoc();
      await fetchVersions();
    } catch {
      setError(true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprove() {
    if (!latestVersion) return;
    setActionLoading(true);
    try {
      // G3: uses the REAL version id from the version list
      const result = await mutate<{ approveDocumentVersion: { id: string } }>(APPROVE_MUTATION, { input: { versionId: latestVersion.id, decision: 'APPROVED' } });
      showToast(result.approveDocumentVersion.id);
      await fetchDoc();
      await fetchVersions();
    } catch {
      setError(true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePublish() {
    if (!latestVersion) return;
    setActionLoading(true);
    try {
      // G3: uses the REAL version id from the version list
      const result = await mutate<{ publishControlledDocument: { id: string } }>(PUBLISH_MUTATION, { versionId: latestVersion.id });
      showToast(result.publishControlledDocument.id);
      await fetchDoc();
      await fetchVersions();
    } catch {
      setError(true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCompare() {
    if (selectedVersions.length !== 2) return;
    try {
      const data = await query<{ getDocumentVersionDiff: Diff }>(DIFF_QUERY, {
        v1: selectedVersions[0],
        v2: selectedVersions[1],
      });
      setDiff(data.getDocumentVersionDiff);
    } catch {
      setError(true);
    }
  }

  if (loading) return <p className={styles.loading}>{t('loading')}</p>;
  if (error || !doc) return <ErrorState onRetry={fetchDoc} />;

  return (
    <>
      <PageHeader
        title={doc.title}
        actions={
          <div className={styles.actions}>
            <SecondaryButton onClick={onBack}>{t('back')}</SecondaryButton>
            {doc.status === 'DRAFT' && canAct && (
              <PrimaryButton onClick={handleSubmit} disabled={actionLoading}>
                {t('submitForApproval')}
              </PrimaryButton>
            )}
            {doc.status === 'IN_REVIEW' && canAct && (
              <PrimaryButton onClick={handleApprove} disabled={actionLoading || !latestVersion}>
                {t('approveVersion')}
              </PrimaryButton>
            )}
            {doc.status === 'APPROVED' && canAct && (
              <PrimaryButton onClick={handlePublish} disabled={actionLoading || !latestVersion}>
                {t('publish')}
              </PrimaryButton>
            )}
            {selectedVersions.length === 2 && (
              <SecondaryButton onClick={handleCompare}>{t('compare')}</SecondaryButton>
            )}
          </div>
        }
      />

      <div className={styles.meta}>
        <StatusBadge status={doc.status} />
        <ClauseChip standard={doc.standard} clauseRef={null} />
        <span className={styles.docType}>{doc.docType.replace(/_/g, ' ')}</span>
      </div>

      <div className={styles.layout}>
        {/* Main content area */}
        <div className={styles.main}>
          <Panel title={t('content')}>
            <p>{t('contentPlaceholder')}</p>
          </Panel>

          {diff && (
            <Panel title={t('diffTitle')}>
              <DiffView diff={diff} />
            </Panel>
          )}
        </div>

        {/* Right rail: version history */}
        <div className={styles.rail}>
          <Panel title={t('versionHistory')}>
            {versions.length === 0 ? (
              <p className={styles.compareHint}>{t('noVersions')}</p>
            ) : (
              <>
                <p className={styles.compareHint}>{t('selectTwoVersions')}</p>
                <div className={styles.versionList}>
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className={`${styles.versionRow} ${selectedVersions.includes(v.id) ? styles.versionRowSelected : ''}`}
                      onClick={() => handleVersionSelect(v.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleVersionSelect(v.id);
                      }}
                      aria-pressed={selectedVersions.includes(v.id)}
                    >
                      <span className={styles.versionNo}>v{v.versionNo}</span>
                      <span className={styles.versionSummary}>{v.changeSummary}</span>
                      <span className={styles.versionDate}>
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>

      {/* G8: Success toast with ProvenanceLink */}
      {toast && (
        <div className={styles.toast}>
          <ProvenanceLink entityId={toast.entityId}>
            {t('savedSuccessfully')}
          </ProvenanceLink>
        </div>
      )}
    </>
  );
}
