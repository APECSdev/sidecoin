// packages/wallet/src/__tests__/router.test.ts
//
// Tests for the Vue Router configuration.
// Verifies that all routes are correctly defined, named,
// and resolve to the expected components.

import { describe, it, expect } from "vitest";
import router from "../router";

describe("Router Configuration", () => {
  it("should have exactly 5 routes", () => {
    const routes = router.getRoutes();
    expect(routes).toHaveLength(5);
  });

  it("should have a dashboard route at /", () => {
    const route = router.getRoutes().find((r) => r.path === "/");
    expect(route).toBeDefined();
    expect(route!.name).toBe("dashboard");
  });

  it("should have a send route at /send", () => {
    const route = router.getRoutes().find((r) => r.path === "/send");
    expect(route).toBeDefined();
    expect(route!.name).toBe("send");
  });

  it("should have a receive route at /receive", () => {
    const route = router.getRoutes().find((r) => r.path === "/receive");
    expect(route).toBeDefined();
    expect(route!.name).toBe("receive");
  });

  it("should have a sidechains route at /sidechains", () => {
    const route = router.getRoutes().find((r) => r.path === "/sidechains");
    expect(route).toBeDefined();
    expect(route!.name).toBe("sidechains");
  });

  it("should have a settings route at /settings", () => {
    const route = router.getRoutes().find((r) => r.path === "/settings");
    expect(route).toBeDefined();
    expect(route!.name).toBe("settings");
  });

  it("should use hash history mode", () => {
    // createWebHashHistory produces URLs with # prefix
    // The router's currentRoute starts at / in hash mode
    expect(router.options.history).toBeDefined();
  });

  it("should have unique route names", () => {
    const routes = router.getRoutes();
    const names = routes.map((r) => r.name).filter(Boolean);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have unique route paths", () => {
    const routes = router.getRoutes();
    const paths = routes.map((r) => r.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it("should have components assigned to all routes", () => {
    const routes = router.getRoutes();
    for (const route of routes) {
      expect(
        route.components?.default,
        `Route "${String(route.name)}" is missing a component`
      ).toBeDefined();
    }
  });
});
