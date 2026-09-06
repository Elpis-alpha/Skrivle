import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library auto-cleans only when Vitest globals are on; they aren't
// (see vitest.config.mts), so without this every render stacks up in the DOM
// and queries start reporting duplicate matches.
afterEach(cleanup);
