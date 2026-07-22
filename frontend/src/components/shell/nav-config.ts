/**
 * Navigation configuration — §10 IA (architecture.md).
 *
 * All nav data lives here; Sidebar renders from this config.
 * Sections: Command Center (top) / DOCUMENTS / AUDIT & READINESS / OPERATIONS / ADMIN.
 * Old routes (/m1–m5, /qms) are client-redirect stubs — NOT in the nav.
 */

import { canSeeAdmin } from '@/lib/role-matrix';

export interface NavItemDef {
  href: string;
  labelKey: string; // i18n key under `nav.*`
}

export interface NavSectionDef {
  labelKey: string; // i18n key under `nav.*` for the section header
  items: NavItemDef[];
  roleGate?: (role: string) => boolean; // presentation-only filter
}

/**
 * Top-level nav item — Command Center. No section header, sits above all sections.
 */
export const topItem: NavItemDef = {
  href: '/dashboard',
  labelKey: 'commandCenter',
};

/**
 * §10 IA sections in display order.
 */
export const navSections: NavSectionDef[] = [
  {
    labelKey: 'documents',
    items: [
      { href: '/manual', labelKey: 'manual' },
      { href: '/documents', labelKey: 'docBrowser' },
      { href: '/forms', labelKey: 'forms' },
      { href: '/cross-reference', labelKey: 'crossReference' },
      { href: '/guide', labelKey: 'guide' },
    ],
  },
  {
    labelKey: 'auditReadiness',
    items: [
      { href: '/audit-readiness', labelKey: 'auditReadinessItem' },
      { href: '/audits', labelKey: 'audits' },
      // /ai-review removed (studio wave S0): the review-queue concept lives
      // inside each studio's agent rail + the Command Center inbox.
      { href: '/activity', labelKey: 'activityLog' },
      { href: '/analytics', labelKey: 'analyticsLabel' },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      { href: '/capa', labelKey: 'capa' },
      { href: '/risk', labelKey: 'risk' },
      { href: '/records', labelKey: 'records' },
      { href: '/management-review', labelKey: 'managementReview' },
    ],
  },
  {
    labelKey: 'admin',
    items: [
      { href: '/settings', labelKey: 'settings' },
      { href: '/billing', labelKey: 'billing' },
      { href: '/setup', labelKey: 'setup' },
    ],
    roleGate: canSeeAdmin,
  },
];
