let writer: string | undefined;
let recoveryWriter: string | undefined;
/** Fresh for every page instance, including duplicated tabs; local recovery uses stored concepts. */
export function browserWriterId(): string {
  if (!writer) {
    writer = crypto.randomUUID();
    try {
      recoveryWriter = sessionStorage.getItem('ima-apply.previous-draft-writer') ?? undefined;
      sessionStorage.setItem('ima-apply.previous-draft-writer', writer);
    } catch {
      /* Independent writer slots work without session storage. */
    }
  }
  return writer;
}
/** Only a recovery preference, never permission to overwrite or delete another writer's slot. */
export function priorBrowserWriterId(): string | undefined {
  browserWriterId();
  return recoveryWriter;
}
