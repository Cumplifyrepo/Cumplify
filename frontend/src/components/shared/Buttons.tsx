'use client';

import { type ButtonHTMLAttributes } from 'react';
import styles from './Buttons.module.css';

/**
 * PrimaryButton — pill, bg accent, text textOnAccent, hover 8% lighten.
 * SecondaryButton — pill, transparent, 1px borderStrong, text textHeading.
 * Destructive variant swaps accent→danger.
 */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive';
}

export function PrimaryButton({ children, className, ...props }: ButtonProps) {
  return (
    <button className={`${styles.primary} ${className ?? ''}`} {...props}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className, ...props }: ButtonProps) {
  return (
    <button className={`${styles.secondary} ${className ?? ''}`} {...props}>
      {children}
    </button>
  );
}

export function DestructiveButton({ children, className, ...props }: ButtonProps) {
  return (
    <button className={`${styles.destructive} ${className ?? ''}`} {...props}>
      {children}
    </button>
  );
}
