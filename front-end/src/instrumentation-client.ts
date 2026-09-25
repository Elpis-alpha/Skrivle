// Next.js runs this before the app hydrates, so an error thrown while hydrating
// is caught too.
//
// These see what nothing else caught. That includes a render error with no
// error.tsx above it: Next hands those to window.reportError, which fires the
// "error" event. An error.tsx that does catch one reports it itself.

import { reportError } from "@/lib/report-error";

window.addEventListener("error", (event) => reportError(event.error ?? event.message, "window"));
window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "promise"));
