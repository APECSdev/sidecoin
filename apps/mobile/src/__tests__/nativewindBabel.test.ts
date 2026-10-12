// apps/mobile/src/__tests__/nativewindBabel.test.ts
//
// NativeWind babel wiring guard.
//
// The nativewind/babel preset is EXCLUDED under Jest (its injected
// _ReactNativeCSSInterop references violate jest.mock() hoisting rules —
// see babel.config.js), so no component test can observe the className →
// style transform. This test runs the transform directly through @babel/core
// and asserts the preset is present and functional: className JSX must be
// compiled against react-native-css-interop's jsx-runtime, not the default
// react/jsx-runtime.
//
// If someone removes the preset from babel.config.js, this test fails even
// though every render test still passes (they run with the preset off).

// @babel/core ships no bundled types (@types/babel__core is not in the
// dependency set); require() keeps this test out of the type system.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transformSync } = require("@babel/core");

const SOURCE = `
import { Text } from "react-native";
export function Probe() {
  return <Text className="text-ecash-500">hi</Text>;
}
`;

function transform(presets: Array<string>): string {
  const result = transformSync(SOURCE, {
    filename: "probe.tsx",
    presets,
    // Isolate from babel.config.js so the test measures exactly the
    // presets it lists.
    configFile: false,
    babelrc: false,
  });
  return result?.code ?? "";
}

describe("nativewind/babel preset", () => {
  it("compiles className JSX against react-native-css-interop/jsx-runtime", () => {
    const code = transform(["@react-native/babel-preset", "nativewind/babel"]);
    expect(code).toContain("react-native-css-interop/jsx-runtime");
    expect(code).toContain("text-ecash-500");
  });

  it("documents the baseline: without the preset, plain jsx-runtime is used", () => {
    // This is what the Jest environment sees (preset excluded). It exists
    // to pin the difference the preset makes — if this baseline ever
    // changes, the exclusion rationale in babel.config.js needs re-review.
    const code = transform(["@react-native/babel-preset"]);
    expect(code).not.toContain("react-native-css-interop");
    expect(code).toContain("react/jsx-runtime");
  });
});
