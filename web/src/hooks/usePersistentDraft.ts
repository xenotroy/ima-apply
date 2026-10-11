import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  afterWorkspaceSaved,
  draftBase,
  DRAFT_CHANGE_EVENT,
  LocalDraftStore,
  rememberUnstoredDraft,
  forgetUnstoredDraft,
  type LocalDraft,
} from '../data/local-drafts';
import { browserWriterId, priorBrowserWriterId } from '../data/browser-writer';

export interface DraftStatus {
  error: string;
  recovered: boolean;
  savedAt: string;
  clear: () => void;
  candidates: LocalDraft[];
  restore: (writer: string) => void;
}
/** Initial state is loaded once. Mount forms with a key when their record identity changes. */
export function usePersistentDraft<T>(
  key: string,
  initial: T | (() => T),
  base = 'new/v1',
  canRestore: (value: T) => boolean = () => true,
): [T, Dispatch<SetStateAction<T>>, DraftStatus] {
  const [loaded] = useState(() => {
    const value = typeof initial === 'function' ? (initial as () => T)() : initial;
    const writer = browserWriterId();
    try {
      const store = new LocalDraftStore(localStorage);
      const own = store.list(key).find((draft) => draft.writer === writer && draft.base === base);
      const recovered =
        (own as LocalDraft<T> | undefined) ??
        store.recover<T>(key, base, priorBrowserWriterId() ?? writer);
      if (recovered && !canRestore(recovered.value))
        throw new Error(
          'Dit concept hoort bij een record dat inmiddels is vastgelegd. Het blijft behouden via Rapportage; je kunt hier een nieuw record maken.',
        );
      return {
        value: recovered?.value ?? value,
        writer,
        recovered,
        candidates: [] as LocalDraft[],
        error: '',
      };
    } catch (error) {
      let candidates: LocalDraft[] = [];
      try {
        candidates = new LocalDraftStore(localStorage)
          .list(key)
          .filter((draft) => draft.base === base && canRestore(draft.value as T));
      } catch {
        /* Preserve the original error and storage. */
      }
      return { value, writer, recovered: null, candidates, error: String(error) };
    }
  });
  const [value, setValue] = useState(loaded.value);
  const valueRef = useRef(value);
  const recoveredRef = useRef<LocalDraft<T> | null>(loaded.recovered);
  const [error, setError] = useState(loaded.error);
  const [savedAt, setSavedAt] = useState(loaded.recovered?.savedAt ?? '');
  const [recovered, setRecovered] = useState(Boolean(loaded.recovered));
  const set: Dispatch<SetStateAction<T>> = (change) => {
    const next =
      typeof change === 'function' ? (change as (value: T) => T)(valueRef.current) : change;
    valueRef.current = next;
    setValue(next);
    try {
      const saved = new LocalDraftStore(localStorage).save(key, base, loaded.writer, next);
      forgetUnstoredDraft(key, loaded.writer);
      setSavedAt(saved.savedAt);
      setError('');
      window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
    } catch (error) {
      rememberUnstoredDraft({
        schema: 'ima.local-draft/v1',
        key,
        base,
        writer: loaded.writer,
        value: next,
        savedAt: new Date().toISOString(),
      });
      setError(
        `Concept niet lokaal bewaard: ${String(error)} Exporteer of kopieer de huidige tekst.`,
      );
      window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
    }
  };
  const clear = () => {
    const committedValueHash = draftBase(valueRef.current);
    afterWorkspaceSaved(key.split('/')[0], () => {
      try {
        const store = new LocalDraftStore(localStorage);
        for (const candidate of store.list(key).filter((draft) => draft.writer === loaded.writer)) {
          // A later keystroke or another tab's work must survive an earlier commit.
          if (
            candidate.writer === loaded.writer &&
            draftBase(candidate.value) !== committedValueHash
          )
            continue;
          store.remove(candidate);
          forgetUnstoredDraft(candidate.key, candidate.writer);
        }
        recoveredRef.current = null;
        if (draftBase(valueRef.current) === committedValueHash)
          forgetUnstoredDraft(key, loaded.writer);
        setSavedAt('');
        window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
      } catch (error) {
        setError(`Het concept blijft bewaard: ${String(error)}`);
      }
    });
  };
  const restore = (writer: string) => {
    try {
      const candidate = new LocalDraftStore(localStorage)
        .list(key)
        .find((draft) => draft.writer === writer && draft.base === base);
      if (!candidate) throw new Error('Dit concept is niet meer beschikbaar bij deze bronversie.');
      if (!canRestore(candidate.value as T))
        throw new Error('Dit concept is inmiddels vastgelegd. Het blijft behouden via Rapportage.');
      set(candidate.value as T);
      setRecovered(true);
    } catch (error) {
      setError(String(error));
    }
  };
  return [value, set, { error, recovered, savedAt, clear, candidates: loaded.candidates, restore }];
}
