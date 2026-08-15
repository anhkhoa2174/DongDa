import type { ReactNode } from 'react';

type SectionCardTitleProps = {
  icon: ReactNode;
  children: ReactNode;
};

export function SectionCardTitle({ icon, children }: SectionCardTitleProps) {
  return (
    <span className="section-card-title">
      {icon}
      {children}
    </span>
  );
}
