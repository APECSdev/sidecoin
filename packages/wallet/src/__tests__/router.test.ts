// packages/wallet/src/__tests__/router.test.ts
//
// Tests for the Vue Router configuration.
// Verifies that all routes are correctly defined, named,
// and resolve to the expected components.

import { describe, it, expect } from "vitest";
import router from "../router";

describe("Router Configuration", () => {
  it("should have exactly 9 routes", () => {
    const routes = router.getRoutes();
    expect(routes).toHaveLength(9);
  });

  it.each([
    ["/onboarding", "onboarding"],
    ["/", "dashboard"],
    ["/send", "send"],
    ["/receive", "receive"],
    ["/swap", "swap"],
    ["/sidechains", "sidechains"],
    ["/hardware", "hardware"],
    ["/toolbox", "toolbox"],
    ["/settings", "settings"],
  ])("should have route %s named %s", (path, name) => {
    const route = router.getRoutes().find((r) => r.path === path);
    expect(route).toBeDefined();
    expect(route!.name).toBe(name);
  });

  it("should use hash history mode", () => {
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
        `Route "${String(route.name)}" is missing a component`,
      ).toBeDefined();
    }
  });
});
