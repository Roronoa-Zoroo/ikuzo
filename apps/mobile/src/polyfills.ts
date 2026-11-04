/*
 * Hermes (React Native's JavaScript engine) does not ship the ES2023
 * "change array by copy" methods yet. Browsers and Node do, which is why
 * code using them works on web but crashes on phones. Define the ones the
 * app uses before anything else loads.
 */
type Compare<T> = (a: T, b: T) => number;

// TypeScript already declares toSorted (lib ESNext); at runtime Hermes may not have it.
if (typeof (Array.prototype as { toSorted?: unknown }).toSorted !== "function") {
  // oxlint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    value<T>(this: T[], compareFn?: Compare<T>): T[] {
      const copy = [...this];
      // oxlint-disable-next-line unicorn/no-array-sort
      copy.sort(compareFn);
      return copy;
    },
    writable: true,
  });
}
