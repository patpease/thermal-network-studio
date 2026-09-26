import { useEffect, useState } from 'react';

/** The phone layout's breakpoint: one screen at a time below it. */
export const PHONE_QUERY = '(max-width: 860px)';

/** Whether the phone layout is in force. False where there is no matchMedia (jsdom). */
export function usePhone(): boolean {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null;
  const [phone, setPhone] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = () => setPhone(query.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query?.media]);
  return phone;
}
