// apps/mobile/.eslintrc.js
//
// ESLint config for the React Native wallet.
//
// ESLint 8 is in use here (see package.json), so this is the legacy
// `.eslintrc.js` format rather than the flat `eslint.config.js` that ESLint 9
// defaults to. `@react-native/eslint-config` is the RN 0.81.1 preset and
// declares `peerDependencies: { eslint: ">=8", prettier: ">=2" }`, both of
// which are satisfied by the versions already pinned in package.json.
//
// The preset ships the parser (@babel/eslint-parser + @typescript-eslint),
// the plugin set (react, react-hooks, react-native, jest, eslint-comments,
// ft-flow) and `extends: ["prettier"]`, so this file only needs to wire the
// preset in and describe what to lint.
//
// NOTE: `.ts`/`.tsx` are included explicitly. ESLint does not inspect files
// with extensions it has not been told about, and every screen and test in
// this app is TypeScript.
module.exports = {
  root: true,
  extends: ['@react-native'],
  overrides: [
    {
      // Jest globals are available without importing them, because the mobile
      // tsconfig does not carry @types/jest for the test sources. Without this
      // block every `describe`/`it`/`expect` would be flagged as undefined.
      //
      // `eslint-plugin-jest` must be listed in `plugins` as well as `env`:
      // the preset's own `env: { 'jest/globals': true }` entry is rejected by
      // ESLint's config validator unless the plugin is registered first.
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*.ts', '**/__tests__/**/*.tsx'],
      plugins: ['jest'],
      env: { 'jest/globals': true },
    },
  ],
};
