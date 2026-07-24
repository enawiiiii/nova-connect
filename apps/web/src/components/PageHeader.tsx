import type { ReactNode } from 'react';
import { product } from '../config/product';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">{product.shortName} / 01</p><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </header>
  );
}
