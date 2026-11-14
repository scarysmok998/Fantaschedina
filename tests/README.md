# Dropdown regression test

Requires Node.js and Playwright (`npm install --no-save playwright`, then `npx playwright install chromium webkit`). Run:

```
node tests/dropdown.cjs
BROWSER=webkit node tests/dropdown.cjs
```

Optional variables: `CHROME_PATH` selects a local Chromium executable; `SOURCE_HTML` tests a previous index.html. Playwright's standard `PLAYWRIGHT_BROWSERS_PATH` and Node's `NODE_PATH` are also supported.

The fixture extracts the actual dropdown code and CSS from index.html and creates 60 options at a mobile viewport. It checks internal scroll, final-option tap, a single native change event, page scroll, resize, outside tap and keyboard navigation/Escape. Chromium additionally receives a touch swipe through CDP and checks that it scrolls without selecting.

Verified on desktop Chrome with mobile/touch emulation and Playwright WebKit. The original main (3f38500) fails the first internal-scroll assertion; the patched version passes. WebKit's scroll test is programmatic, with touchscreen taps. Physical iOS/Android devices, Safari rubber-band/momentum behavior and authenticated Admin integration are not covered. No production data or credentials are required or changed.
