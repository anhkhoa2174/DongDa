import type { KeyboardEvent } from 'react';

export function preventNumberInputEnter(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== 'Enter') return;

  const target = event.target;
  if (target instanceof Element && target.closest('.ant-input-number')) {
    event.preventDefault();
  }
}
