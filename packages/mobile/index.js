// packages/mobile/index.js
//
// React Native application entry point.
//
// This is the file registered with AppRegistry. It MUST:
//   1. Load polyfills FIRST (before any other import)
//   2. Register the root App component
//
// The app name "Sidecoin" must match the "name" field in app.json
// and the native project configuration.

// ──────────────────────────────────────────────────────
// 1. Polyfills — MUST be the very first import.
//    See src/polyfills.ts for details on what each
//    polyfill provides and why order matters.
// ──────────────────────────────────────────────────────
import "./src/polyfills";

// ──────────────────────────────────────────────────────
// 2. Gesture Handler
//    react-native-gesture-handler must be imported at
//    the entry point, before any navigation or gesture-
//    based component is loaded. This installs the native
//    gesture handler root view wrapper.
// ──────────────────────────────────────────────────────
import "react-native-gesture-handler";

// ──────────────────────────────────────────────────────
// 3. App Registration
// ──────────────────────────────────────────────────────
import { AppRegistry } from "react-native";
import App from "./src/App";
import { name as appName } from "./app.json";

AppRegistry.registerComponent(appName, () => App);
