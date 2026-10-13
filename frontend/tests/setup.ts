import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Crea keeps a draft in sessionStorage (C16): start every test from an empty tab.
afterEach(() => {
  window.sessionStorage.clear();
});
