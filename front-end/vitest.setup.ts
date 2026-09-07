import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library auto-cleans only when Vitest globals are on; they aren't
// (see vitest.config.mts), so without this every render stacks up in the DOM
// and queries start reporting duplicate matches.
afterEach(cleanup);

// jsdom doesn't implement elementFromPoint, and input-otp polls it on a timer
// to track the caret. Without a stub the timer throws after the test that
// rendered the OTP field has already finished, which surfaces as an uncaught
// exception and a non-zero exit even though every assertion passed.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
