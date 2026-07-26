import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrollIntoView. It is a layout concern with nothing
// to assert in a test, but components that call it would throw without a stub.
Element.prototype.scrollIntoView ??= () => {}
