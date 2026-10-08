import { useState } from 'react';
import Modal from './Modal';
import BodyMap from './BodyMap';
import { LIBRARY_LIST_ID } from './ExerciseNameOptions';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import useCatalog from '../hooks/useCatalog';
import { resolve, candidates, regionsOf, gifUrl, titleCase, norm, MEDIA_CREDIT } from '../lib/catalog';

const MONO = 'var(--font-mono)';

// How-to for one of the user's exercises: the library's animation, the muscles
// it works and its steps. Also where a name gets (re)matched to the library —
// the user's name is never changed, only what it points at.
export default function ExerciseInfo({ open, onClose, name }) {
  return (
    <Modal open={open} onClose={onClose} title={name || 'Exercise'}>
      {open && <Body name={name} />}
    </Modal>
  );
}

function Body({ name }) {
  const cat = useCatalog();
  const { settings, saveExerciseLinks } = useWorkout();
  const { showToast } = useToast();
  const links = settings?.exerciseLinks || {};
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  if (!cat) return <div className="p-6 text-center text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>Loading library…</div>;
  const x = resolve(name, links, cat);

  const link = (id) => {
    saveExerciseLinks({ [name]: id }).catch((e) => showToast('Error: ' + e.message, 'error'));
    setPicking(false);
    setQuery('');
  };
  const typed = cat.byName[norm(query)];

  return (
    <div className="p-4 flex flex-col gap-4">
      {x ? (
        <>
          <div className="flex gap-3 items-center">
            <img src={gifUrl(x)} alt={`${x.n} demonstration`} width="150" height="150"
              className="w-[150px] h-[150px] rounded-2xl bg-white flex-shrink-0 object-contain" />
            <div className="flex-1 min-w-0"><BodyMap heat={regionsOf(x)} height={150} /></div>
          </div>
          <div>
            <div className="text-[17px] font-extrabold">{titleCase(x.n)}</div>
            <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>
              {x.eq} · works {x.t}{x.s.length ? ` · also ${x.s.join(', ')}` : ''}
            </div>
          </div>
          <ol className="flex flex-col gap-2 text-[13px] text-text-secondary list-decimal pl-5" style={{ lineHeight: 1.5 }}>
            {x.st.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <div className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{MEDIA_CREDIT}</div>
        </>
      ) : (
        <p className="text-[13px] text-text-secondary" style={{ lineHeight: 1.5 }}>
          {name in links ? 'Marked as not in the exercise library.' : 'Not matched to the exercise library yet.'} Pick the closest one to get its animation and muscle map.
        </p>
      )}

      {!picking && x && (
        <button onClick={() => setPicking(true)} className="self-start text-text-tertiary underline" style={{ font: `500 11px ${MONO}` }}>Wrong exercise? Change match</button>
      )}
      {(picking || !x) && (
        <div className="flex flex-col gap-2">
          <div className="g-label">CLOSEST IN THE LIBRARY</div>
          <div className="flex flex-wrap gap-1.5">
            {candidates(name, cat, 6).filter((c) => c !== x).map((c) => (
              <button key={c.id} onClick={() => link(c.id)} className="px-3 h-9 rounded-[12px] bg-bg-2 text-[12px] font-semibold text-text-primary">{titleCase(c.n)}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} list={LIBRARY_LIST_ID} placeholder="Search the library"
              className="flex-1 min-w-0 h-11 px-3 rounded-[12px] bg-bg-2 text-sm text-text-primary" />
            <button onClick={() => link(typed.id)} disabled={!typed} className="h-11 px-4 rounded-[12px] bg-accent font-bold text-sm disabled:opacity-40" style={{ color: 'var(--color-on-accent)' }}>Use</button>
          </div>
          {!(name in links && !links[name]) && (
            <button onClick={() => link('')} className="self-start text-text-tertiary underline" style={{ font: `500 11px ${MONO}` }}>Not in the library (cardio machine, custom move)</button>
          )}
        </div>
      )}
    </div>
  );
}
