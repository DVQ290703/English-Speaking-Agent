import { useEffect, useState } from 'react';

import type { ApiCategory } from '../api/topics';
import { fetchTopicCategories } from '../api/topics';
import { getAuthSession } from '../auth/tokenStorage';

type State = {
  categories: ApiCategory[];
  loading: boolean;
  error: string | null;
};

export function useTopics(): State {
  const [state, setState] = useState<State>({ categories: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const session = getAuthSession();
    fetchTopicCategories(session?.token ?? undefined)
      .then((cats) => {
        if (!cancelled) setState({ categories: cats, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ categories: [], loading: false, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
