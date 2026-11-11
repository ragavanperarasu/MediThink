import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Reports · MediThink". */
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · MediThink` : 'MediThink — Medical report analysis';
  }, [title]);
}
