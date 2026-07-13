'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './NavItem.module.css';

/**
 * Single nav item — active state: surfaceRaised bg + accent left rail (3px).
 * Inactive: textSecondary, hover surfaceHover.
 */
export function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  return (
    <li>
      <Link
        href={href}
        className={`${styles.item} ${isActive ? styles.active : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        {label}
      </Link>
    </li>
  );
}
