// packages/explorer/src/__tests__/static-assets.test.ts

import indexHtml from "../../index.html?raw";

const faviconAssets = [
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-48x48.png",
  "/apple-touch-icon.png",
];

describe("explorer static assets", () => {
  it("keeps favicon links in index.html", () => {
    expect(indexHtml).toContain(
      '<link rel="icon" href="/favicon.ico" sizes="any" />',
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />',
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />',
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />',
    );
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
  });

  it("keeps the expected public favicon route list explicit", () => {
    expect(faviconAssets).toEqual([
      "/favicon.ico",
      "/favicon-16x16.png",
      "/favicon-32x32.png",
      "/favicon-48x48.png",
      "/apple-touch-icon.png",
    ]);

    for (const asset of faviconAssets) {
      expect(indexHtml).toContain(asset);
    }
  });

  it("does not require the removed svg favicon", () => {
    expect(indexHtml).not.toContain("favicon.svg");
  });

  it("keeps the explorer document title unstyled", () => {
    expect(indexHtml).toContain("<title>Sidecoin Explorer</title>");
    expect(indexHtml).not.toContain("<title>SidΞcoin Explorer</title>");
  });

  it("keeps the explorer app entrypoint and analytics wiring", () => {
    expect(indexHtml).toContain('<div id="app"></div>');
    expect(indexHtml).toContain(
      '<script type="module" src="/src/main.ts"></script>',
    );
    expect(indexHtml).toContain("https://scripts.simpleanalyticscdn.com/latest.js");
    expect(indexHtml).toContain("https://queue.simpleanalyticscdn.com/noscript.gif");
  });
});
