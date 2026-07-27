import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView. It is a layout concern with nothing
// to assert in a test, but components that call it would throw without a stub.
Element.prototype.scrollIntoView ??= () => {}

// jsdom does not implement matchMedia either. The default answer is "no" for
// every query; tests that care about a particular one spy on this.
window.matchMedia ??= ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia
