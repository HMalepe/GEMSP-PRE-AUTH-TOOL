/**
 * Screen 4 — Override / motivation capture (Implementation Companion §C.5).
 * A consultant overriding a Layer-A decision MUST enter a reason; the
 * override + reason + user + timestamp goes to the immutable audit log
 * (backend/src/audit).
 */
export function OverrideScreen() {
  return (
    <section>
      <h1>Override / motivation capture</h1>
      <p>Not yet implemented — writes to the audit log once wired.</p>
    </section>
  );
}
