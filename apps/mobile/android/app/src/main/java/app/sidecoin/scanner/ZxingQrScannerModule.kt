// apps/mobile/android/app/src/main/java/app/sidecoin/scanner/ZxingQrScannerModule.kt
//
// A minimal, FOSS-only QR scanner for the Sidecoin wallet.
//
// WHY THIS EXISTS:
//   react-native-vision-camera (the library the Vue port used) hard-depends on
//   Google MLKit: its Kotlin core imports com.google.mlkit.vision.barcode in
//   CameraSession.kt and CameraView.kt, and both branches of its
//   `enableCodeScanner` flag pull either play-services-mlkit-barcode-scanning
//   or com.google.mlkit:barcode-scanning. There is no GMS-free mode, so an
//   F-Droid build cannot use it.
//
//   This module does the same job with two Apache-2.0 components that ship no
//   proprietary code:
//     • androidx.camera (CameraX) for the preview + frame stream
//     • com.google.zxing:core for the actual QR decode
//
// DESIGN NOTE — why a Promise + Activity instead of a Fabric view:
//   The app runs the New Architecture (newArchEnabled=true) but declares no
//   codegenConfig, so no Fabric component delegates are generated for this
//   package. Registering a <ZxingQrScannerView> would therefore require
//   standing up the whole codegen pipeline for one screen.
//
//   Instead this exposes a single async method, `scan()`, which launches a
//   self-contained full-screen Activity and resolves with the decoded payload
//   (or null when the user backs out). That is architecture-independent, needs
//   no codegen, and keeps the JS contract identical to the old scanner: one
//   decoded value, then the overlay closes.

package app.sidecoin.scanner

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ZxingQrScannerModule.NAME)
class ZxingQrScannerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * The in-flight scan() promise. Only one scan can be open at a time —
     * the camera is a single shared resource, and the JS overlay is modal.
     */
    private var pendingPromise: Promise? = null

    /**
     * Receives the decoded value from [ZxingQrScannerActivity] when it finishes.
     * RESULT_OK + the extra carries the payload; RESULT_CANCELED means the user
     * backed out, which resolves null (not an error) so the caller can simply
     * return to the previous screen.
     */
    private val activityListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity,
                requestCode: Int,
                resultCode: Int,
                data: Intent?,
            ) {
                if (requestCode != REQUEST_CODE) return

                val promise = pendingPromise ?: return
                pendingPromise = null

                if (resultCode == Activity.RESULT_OK) {
                    val value = data?.getStringExtra(ZxingQrScannerActivity.EXTRA_QR_VALUE)
                    if (value.isNullOrEmpty()) {
                        // A RESULT_OK with no payload should not happen; treat it
                        // as a cancel rather than resolving an empty address.
                        promise.resolve(null)
                    } else {
                        promise.resolve(value)
                    }
                } else {
                    promise.resolve(null)
                }
            }
        }

    init {
        reactContext.addActivityEventListener(activityListener)
    }

    /**
     * Launch the scanner. Resolves with the decoded string, or null when the
     * user cancels. Rejects only when there is no foreground Activity to host
     * the camera (e.g. the app is backgrounded), which the JS side surfaces as
     * the same "no usable camera" guidance the old scanner showed.
     */
    @ReactMethod
    fun scan(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject(
                E_NO_ACTIVITY,
                "No foreground activity to host the camera.",
            )
            return
        }

        if (pendingPromise != null) {
            promise.reject(E_BUSY, "A scan is already in progress.")
            return
        }

        pendingPromise = promise

        try {
            val intent = Intent(reactContext, ZxingQrScannerActivity::class.java)
            activity.startActivityForResult(intent, REQUEST_CODE)
        } catch (err: Exception) {
            pendingPromise = null
            promise.reject(E_START_FAILED, err.message, err)
        }
    }

    /** True — this build compiled the FOSS scanner in. Lets JS feature-detect. */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun isAvailable(): Boolean = true

    override fun invalidate() {
        reactContext.removeActivityEventListener(activityListener)
        // Never leave a promise dangling if the module is torn down mid-scan.
        pendingPromise?.resolve(null)
        pendingPromise = null
        super.invalidate()
    }

    companion object {
        const val NAME = "ZxingQrScanner"
        private const val REQUEST_CODE = 0x5C4A // "SCAN"

        private const val E_NO_ACTIVITY = "E_NO_ACTIVITY"
        private const val E_BUSY = "E_BUSY"
        private const val E_START_FAILED = "E_START_FAILED"
    }
}
