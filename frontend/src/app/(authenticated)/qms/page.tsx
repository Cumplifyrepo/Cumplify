'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, Panel, PrimaryButton, SecondaryButton, ErrorState } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import styles from './page.module.css';

/**
 * QMS Document Engine — Org Profile Wizard + Clause Registry/Applicability (spec 40, Task 10).
 *
 * Tab 1: Org profile wizard (ORG-1 field list; shared zod contract — same fields).
 * Tab 2: Clause registry with applicability management (ORG-3 named gaps, ORG-4 exclusion).
 *
 * The OrgProfileSchema in qms.ts is the enforcement contract (one schema, two consumers).
 * This UI mirrors the same fields for UX; server validates on save.
 */

// ─── ORG-1 field structure (mirrors OrgProfileSchema from qms.ts) ────────────
const VALID_STANDARDS = ['ISO9001', 'ISO14001', 'ISO45001'] as const;

interface OrgProfile {
  legalName: string;
  sites: Array<{ name: string; address?: string; headcount?: number }>;
  employeeCount: number;
  industry: string;
  productsServices: string;
  coreProcesses: string[];
  designResponsibility: boolean;
  standardsInScope: string[];
  managementRep: string;
  targetCertDate?: string;
}

interface ClauseEntry {
  id: string;
  standard: string;
  clauseNo: string;
  clauseTitle: string;
  intentParaphrase: string;
  requiredSources: string;
  sortOrder: number;
}

interface Applicability {
  id: string;
  clauseRegistryId: string;
  applicable: boolean;
  justification: string | null;
}

const GET_PROFILE = `query GetOrgProfile { getOrgProfile { id currentVersion payload updatedAt } }`;
const SAVE_PROFILE = `mutation SaveOrgProfile($input: SaveOrgProfileInput!) { saveOrgProfile(input: $input) { id currentVersion payload updatedAt } }`;
const LIST_REGISTRY = `query ListClauseRegistry($standard: Standard) { listClauseRegistry(standard: $standard) { id standard clauseNo clauseTitle intentParaphrase requiredSources sortOrder } }`;
const LIST_APPLICABILITY = `query ListClauseApplicability { listClauseApplicability { id clauseRegistryId applicable justification } }`;
const SET_APPLICABILITY = `mutation SetClauseApplicability($input: SetClauseApplicabilityInput!) { setClauseApplicability(input: $input) { id clauseRegistryId applicable justification } }`;

const DEFAULT_PROFILE: OrgProfile = {
  legalName: '', sites: [{ name: '' }], employeeCount: 0,
  industry: '', productsServices: '', coreProcesses: [''],
  designResponsibility: false, standardsInScope: [], managementRep: '', targetCertDate: '',
};

export default function QmsPage() {
  const t = useTranslations('qms');
  const tWizard = useTranslations('qms.wizard');
  const tRegistry = useTranslations('qms.registry');
  const { query, mutate } = useGraphQL();

  const [tab, setTab] = useState<'wizard' | 'registry'>('wizard');
  const [profile, setProfile] = useState<OrgProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clauses, setClauses] = useState<ClauseEntry[]>([]);
  const [applicability, setApplicability] = useState<Map<string, Applicability>>(new Map());
  const [registryLoading, setRegistryLoading] = useState(false);

  // ─── Wizard: Load profile ──────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{ getOrgProfile: { payload: string } | null }>(GET_PROFILE);
      if (data.getOrgProfile?.payload) {
        setProfile(JSON.parse(data.getOrgProfile.payload));
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await mutate(SAVE_PROFILE, { input: { payload: JSON.stringify(profile) } });
    } catch (err) {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  // ─── Registry: Load clauses + applicability ────────────────────────────────
  const fetchRegistry = useCallback(async () => {
    try {
      setRegistryLoading(true);
      const [regData, appData] = await Promise.all([
        query<{ listClauseRegistry: ClauseEntry[] }>(LIST_REGISTRY),
        query<{ listClauseApplicability: Applicability[] }>(LIST_APPLICABILITY),
      ]);
      setClauses(regData.listClauseRegistry);
      const appMap = new Map<string, Applicability>();
      for (const a of appData.listClauseApplicability) appMap.set(a.clauseRegistryId, a);
      setApplicability(appMap);
    } catch {
      setError(true);
    } finally {
      setRegistryLoading(false);
    }
  }, [query]);

  useEffect(() => { if (tab === 'registry') fetchRegistry(); }, [tab, fetchRegistry]);

  async function handleSetApplicability(clauseId: string, applicable: boolean, justification?: string) {
    try {
      const result = await mutate<{ setClauseApplicability: Applicability }>(SET_APPLICABILITY, {
        input: { clauseRegistryId: clauseId, applicable, justification: justification || undefined },
      });
      setApplicability(prev => new Map(prev).set(clauseId, result.setClauseApplicability));
    } catch (err) {
      setError(true);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (error && !loading) return <ErrorState onRetry={fetchProfile} />;

  return (
    <>
      <PageHeader title={t('title')} />

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'wizard' ? styles.tabActive : ''}`} onClick={() => setTab('wizard')}>
          {t('tabWizard')}
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'registry' ? styles.tabActive : ''}`} onClick={() => setTab('registry')}>
          {t('tabRegistry')}
        </button>
      </div>

      {tab === 'wizard' && (
        loading ? <p className={styles.loading}>{tWizard('loading')}</p> : (
          <Panel title={tWizard('title')}>
            <div className={styles.wizardSteps}>
              <div className={styles.fieldGroup}>
                <WizardField label={tWizard('legalName')} required value={profile.legalName} onChange={v => setProfile(p => ({ ...p, legalName: v }))} />
                <WizardField label={tWizard('industry')} required value={profile.industry} onChange={v => setProfile(p => ({ ...p, industry: v }))} />
                <WizardField label={tWizard('productsServices')} required value={profile.productsServices} onChange={v => setProfile(p => ({ ...p, productsServices: v }))} />
                <WizardField label={tWizard('employeeCount')} required value={String(profile.employeeCount || '')} onChange={v => setProfile(p => ({ ...p, employeeCount: Number(v) || 0 }))} type="number" />
                <WizardField label={tWizard('managementRep')} required value={profile.managementRep} onChange={v => setProfile(p => ({ ...p, managementRep: v }))} />
                <WizardField label={tWizard('targetCertDate')} value={profile.targetCertDate ?? ''} onChange={v => setProfile(p => ({ ...p, targetCertDate: v || undefined }))} type="date" />

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{tWizard('standardsInScope')}<span className={styles.fieldRequired}>*</span></label>
                  {VALID_STANDARDS.map(s => (
                    <label key={s} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--color-text-body)' }}>
                      <input type="checkbox" checked={profile.standardsInScope.includes(s)}
                        onChange={e => setProfile(p => ({ ...p, standardsInScope: e.target.checked ? [...p.standardsInScope, s] : p.standardsInScope.filter(x => x !== s) }))} />
                      {s.replace('ISO', 'ISO ')}
                    </label>
                  ))}
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{tWizard('designResponsibility')}</label>
                  <input type="checkbox" checked={profile.designResponsibility}
                    onChange={e => setProfile(p => ({ ...p, designResponsibility: e.target.checked }))} />
                </div>

                <WizardField label={tWizard('coreProcesses')} required value={profile.coreProcesses.join(', ')}
                  onChange={v => setProfile(p => ({ ...p, coreProcesses: v.split(',').map(s => s.trim()).filter(Boolean) }))} />

                <WizardField label={tWizard('siteName')} required value={profile.sites[0]?.name ?? ''}
                  onChange={v => setProfile(p => ({ ...p, sites: [{ ...p.sites[0], name: v }] }))} />
              </div>

              <div className={styles.actions}>
                <PrimaryButton onClick={handleSaveProfile} disabled={saving}>
                  {saving ? tWizard('saving') : tWizard('save')}
                </PrimaryButton>
              </div>
            </div>
          </Panel>
        )
      )}

      {tab === 'registry' && (
        registryLoading ? <p className={styles.loading}>{tRegistry('loading')}</p> : (
          <div className={styles.clauseList}>
            {clauses.map(clause => (
              <ClauseCard
                key={clause.id}
                clause={clause}
                applicability={applicability.get(clause.id)}
                onSetApplicability={handleSetApplicability}
                tRegistry={tRegistry}
                profileStandards={profile.standardsInScope}
              />
            ))}
          </div>
        )
      )}
    </>
  );
}

// ─── WizardField ─────────────────────────────────────────────────────────────

function WizardField({ label, required, value, onChange, type = 'text' }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}{required && <span className={styles.fieldRequired}>*</span>}</label>
      <input type={type} className={styles.fieldInput} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// ─── ClauseCard (ORG-3 named gaps + ORG-4 exclusion) ─────────────────────────

function ClauseCard({ clause, applicability: app, onSetApplicability, tRegistry, profileStandards: _profileStandards }: {
  clause: ClauseEntry; applicability: Applicability | undefined;
  onSetApplicability: (id: string, applicable: boolean, justification?: string) => void;
  tRegistry: (key: string) => string; profileStandards: string[];
}) {
  const [justification, setJustification] = useState(app?.justification ?? '');
  const isExcluded = app?.applicable === false;

  // ORG-3: named-gap surfacing — show missing required_sources fields by name
  let requiredSources: string[] = [];
  try { requiredSources = JSON.parse(clause.requiredSources) as string[]; } catch { /* empty */ }

  return (
    <div className={styles.clauseCard}>
      <div className={styles.clauseHeader}>
        <span className={styles.clauseNo}>{clause.clauseNo}</span>
        <span className={styles.clauseTitle}>{clause.clauseTitle}</span>
      </div>
      <p className={styles.clauseIntent}>{clause.intentParaphrase}</p>

      {/* ORG-3: Named gaps — per clause, show missing required_sources fields */}
      {requiredSources.length > 0 && (
        <div className={styles.clauseGaps}>
          <strong>{tRegistry('requiredSources')}:</strong>
          {requiredSources.map((src, i) => (
            <div key={i} className={styles.clauseGapItem}>{src}</div>
          ))}
        </div>
      )}

      {/* ORG-4: Applicability toggle — exclude ONLY with justification */}
      <div className={styles.clauseApplicability}>
        {isExcluded ? (
          <>
            <span className={styles.naJustified}>{tRegistry('naJustified')}: {app?.justification}</span>
            <SecondaryButton onClick={() => onSetApplicability(clause.id, true)}>
              {tRegistry('markApplicable')}
            </SecondaryButton>
          </>
        ) : (
          <>
            <input
              type="text"
              className={`${styles.fieldInput} ${styles.justificationInput}`}
              placeholder={tRegistry('justificationPlaceholder')}
              value={justification}
              onChange={e => setJustification(e.target.value)}
            />
            <SecondaryButton
              onClick={() => { if (justification.trim()) onSetApplicability(clause.id, false, justification); }}
              disabled={!justification.trim()}
            >
              {tRegistry('markExcluded')}
            </SecondaryButton>
          </>
        )}
      </div>
    </div>
  );
}
