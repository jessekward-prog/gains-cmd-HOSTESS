import { useEffect, useState } from 'react';
import { loadCatalog } from '../lib/catalog';

// The exercise library, loaded once (its own lazy chunk) and shared.
export default function useCatalog() {
  const [cat, setCat] = useState(null);
  useEffect(() => {
    let live = true;
    loadCatalog().then((c) => live && setCat(c)).catch(() => {});
    return () => { live = false; };
  }, []);
  return cat;
}
