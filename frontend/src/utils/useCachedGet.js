import { useState, useEffect, useRef } from 'react';

/**
 * Lightweight stale-while-revalidate cache for GET requests.
 *
 * On first visit to a page it fetches normally (loading = true).
 * On every later visit it returns the cached data INSTANTLY (no spinner)
 * and silently revalidates in the background, so the UI feels fast even
 * when the backend round trip is slow.
 *
 * Usage:
 *   const { data, loading, error, refetch, mutate } = useCachedGet(
 *     'dashboard-invitations',
 *     async () => (await api.get('/invitations')).data.invitations || []
 *   );
 */
const cache = new Map(); // key -> last successful data

export function invalidateCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

export function useCachedGet(key, fetcher, { enabled = true } = {}) {
  const [data, setData] = useState(() => cache.get(key));
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const hasCached = cache.has(key);
    if (hasCached) {
      setData(cache.get(key));
      setLoading(false); // show cached immediately, revalidate quietly
    } else {
      setLoading(true);
    }

    (async () => {
      try {
        const result = await fetcherRef.current();
        if (cancelled) return;
        cache.set(key, result);
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Keep showing stale data (if any) but surface the error
        setError(err?.response?.data?.message || err?.message || 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key, enabled]);

  // Optimistically update the cache + local state (e.g. after delete/create)
  const mutate = (updater) => {
    const next = typeof updater === 'function' ? updater(cache.get(key)) : updater;
    cache.set(key, next);
    setData(next);
  };

  const refetch = async () => {
    try {
      const result = await fetcherRef.current();
      cache.set(key, result);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Something went wrong');
    }
  };

  return { data, loading, error, refetch, mutate };
}
