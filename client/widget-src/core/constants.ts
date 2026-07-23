// Values shared across core/* and render/carousel.ts that must not drift
// apart into independent copies.

// Must match the media query render/carousel.ts's injected CSS uses for its
// own mobile layout — keeping this as a single imported constant (instead of
// two independently-typed literal strings) is what actually enforces that,
// where before a comment was the only thing keeping them in sync.
export const CAROUSEL_MOBILE_BREAKPOINT = "(max-width: 640px)";
