import { initSentry, captureException } from "../lib/sentry";
describe("sentry wrapper (fdroid/no-DSN no-op)", () => {
  it("initSentry does not throw with no DSN", () => {
    expect(() => initSentry()).not.toThrow();
  });
  it("captureException does not throw with no DSN", () => {
    expect(() => captureException(new Error("x"))).not.toThrow();
  });
});
