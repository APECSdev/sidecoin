// apps/mobile/android/app/src/main/java/app/sidecoin/scanner/ZxingQrScannerPackage.kt
//
// Registers the FOSS ZXing QR scanner with React Native.
//
// Manual registration (rather than autolinking) because this module lives in
// the app itself, not in a node_modules library — autolinking only discovers
// packages under node_modules. MainApplication.getPackages() adds this
// explicitly.
//
// Only the MODULE is registered; the scanner Activity is launched by the
// module itself via startActivityForResult, so there is no ViewManager and no
// Fabric codegen requirement.

package app.sidecoin.scanner

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// createViewManagers is deprecated in React Native (the New Architecture has
// no need for it) but is still an abstract ReactPackage member that must be
// implemented. OVERRIDE_DEPRECATION is the Kotlin diagnostic for overriding a
// deprecated member; DEPRECATION alone does not silence this one.
@Suppress("OVERRIDE_DEPRECATION")
class ZxingQrScannerPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(ZxingQrScannerModule(reactContext))

    /**
     * No custom views. The scanner is a full-screen Activity, not an embedded
     * view, which is what lets it work under the New Architecture without a
     * codegen-generated component delegate.
     *
     * Suppressed at the class level because ReactPackage.createViewManagers is
     * deprecated in React Native (the New Architecture has no need for it) but
     * is still an abstract member that must be implemented.
     */
    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
