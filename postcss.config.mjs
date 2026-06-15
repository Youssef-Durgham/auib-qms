const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Down-level modern CSS so the app renders on old Android System WebViews
    // (used by TV-box kiosk apps like FreeKiosk). Tailwind v4 emits cascade
    // layers (@layer) and color-mix() — engines older than Chromium 99/111
    // silently drop those, leaving the page completely unstyled. These two
    // polyfills flatten @layer (recomputing specificity) and emit static color
    // fallbacks, so the kiosk renders identically to a modern browser.
    "postcss-preset-env": {
      features: {
        "cascade-layers": true,
        "color-mix": true,
      },
    },
  },
};

export default config;
