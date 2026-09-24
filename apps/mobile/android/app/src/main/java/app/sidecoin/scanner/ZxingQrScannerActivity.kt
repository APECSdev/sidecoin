// apps/mobile/android/app/src/main/java/app/sidecoin/scanner/ZxingQrScannerActivity.kt
//
// Full-screen QR scanner Activity: CameraX preview + ZXing decode.
//
// FOSS-ONLY: androidx.camera (Apache-2.0) + com.google.zxing:core (Apache-2.0).
// No Google Play Services, no MLKit — see ZxingQrScannerModule.kt for why the
// VisionCamera-based scanner could not be used in an F-Droid build.
//
// BEHAVIOUR (parity with the old VisionCamera overlay):
//   • Rear camera preview, full screen.
//   • On the FIRST successful QR decode: stop analysing, set the result, and
//     finish — the "emit once, then close" contract the JS side relies on.
//   • Back press / "Close" -> RESULT_CANCELED (JS resolves null).
//   • Camera permission denied -> finish with RESULT_CANCELED; the JS layer
//     already owns the permission-denied copy, so this Activity does not
//     duplicate it.
//   • Any camera failure -> finish with RESULT_CANCELED rather than crash.

package app.sidecoin.scanner

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.Result
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ZxingQrScannerActivity : ComponentActivity() {

    /** Preview surface. */
    private lateinit var previewView: PreviewView

    /** Single-thread executor for frame analysis — decode must not run on the UI thread. */
    private var analysisExecutor: ExecutorService? = null

    /** CameraX provider, retained so onDestroy can unbind cleanly. */
    private var cameraProvider: ProcessCameraProvider? = null

    /**
     * The analysis use case, retained so a successful decode can call
     * clearAnalyzer() on it. (clearAnalyzer() lives on ImageAnalysis, not on
     * the ImageProxy being analysed — calling it via the proxy does not
     * compile.)
     */
    private var imageAnalysis: ImageAnalysis? = null

    /**
     * Guards the "emit once" rule. ZXing can report the same code on
     * consecutive frames; without this the Activity would finish repeatedly.
     */
    private val delivered = AtomicBoolean(false)

    /** ZXing reader. QR-only, matching the old scanner's `codeTypes: ["qr"]`. */
    private val reader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                DecodeHintType.TRY_HARDER to true,
            ),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // The camera permission is declared in the manifest; if the user has
        // not granted it we simply return to the JS layer, which already shows
        // the permission guidance and an "enter address manually" fallback.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "CAMERA permission not granted; closing scanner.")
            finishCanceled()
            return
        }

        buildUi()
        startCamera()
    }

    /**
     * Programmatic UI. Building the view tree in code (rather than XML) keeps
     * this module self-contained: no layout resource to keep in sync, and the
     * whole scanner is one file plus one dependency change.
     */
    private fun buildUi() {
        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.BLACK)
        }

        previewView = PreviewView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            // FILL_CENTER keeps the preview from letterboxing on tall screens.
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        root.addView(previewView)

        // Header: title + Close, mirroring the overlay chrome the user knows.
        val header = TextView(this).apply {
            text = "Scan address"
            setTextColor(Color.WHITE)
            textSize = 18f
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(12))
        }
        root.addView(
            header,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP,
            ),
        )

        val close = Button(this).apply {
            text = "Close"
            setOnClickListener { finishCanceled() }
        }
        root.addView(
            close,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.END,
            ).apply {
                topMargin = dp(16)
                marginStart = dp(16)
                marginEnd = dp(16)
            },
        )

        // Footer hint, verbatim from the previous overlay copy.
        val footer = TextView(this).apply {
            text = "Point your camera at a Bitcoin / eCash QR code."
            setTextColor(Color.LTGRAY)
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(16), dp(20), dp(32))
        }
        root.addView(
            footer,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM,
            ),
        )

        setContentView(root)
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener(
            {
                try {
                    val provider = future.get()
                    cameraProvider = provider

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    val analysis = ImageAnalysis.Builder()
                        // Only the newest frame matters for a live scan; dropping
                        // stale frames keeps decode latency low on slow devices.
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        // 720p is ample for a QR code and cheap to scan. Built
                        // via ResolutionSelector because setTargetResolution()
                        // is deprecated as of CameraX 1.4.
                        .setResolutionSelector(
                            ResolutionSelector.Builder()
                                .setResolutionStrategy(
                                    ResolutionStrategy(
                                        Size(1280, 720),
                                        ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
                                    ),
                                )
                                .build(),
                        )
                        .build()

                    val executor = Executors.newSingleThreadExecutor()
                    analysisExecutor = executor
                    analysis.setAnalyzer(executor) { proxy -> analyze(proxy) }
                    imageAnalysis = analysis

                    provider.unbindAll()
                    provider.bindToLifecycle(
                        this,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                } catch (err: Exception) {
                    Log.e(TAG, "Camera start failed", err)
                    finishCanceled()
                }
            },
            ContextCompat.getMainExecutor(this),
        )
    }

    /**
     * Decode one frame. Always closes the ImageProxy (CameraX stalls if a
     * buffer is not released), and short-circuits once a value was delivered.
     */
    private fun analyze(proxy: ImageProxy) {
        try {
            if (delivered.get()) return

            val value = decode(proxy)
            if (value != null && delivered.compareAndSet(false, true)) {
                // Stop analysing immediately so no further frames are decoded
                // while the Activity finishes. clearAnalyzer() must run on the
                // main thread.
                val analysis = imageAnalysis
                if (analysis != null) {
                    runOnUiThread { analysis.clearAnalyzer() }
                }
                imageAnalysis = null
                analysisExecutor?.shutdown()
                analysisExecutor = null
                finishWithValue(value)
            }
        } catch (err: Exception) {
            // A malformed frame is normal during camera warm-up; ignore it and
            // let the next frame try. Only real camera failures abort.
            Log.d(TAG, "Frame decode skipped: ${err.message}")
        } finally {
            proxy.close()
        }
    }

    /**
     * Convert the YUV frame to ZXing's luminance source.
     *
     * Luminance lives in plane 0 (Y); ZXing only needs that plane, so we skip
     * the chroma planes entirely. The data buffer's row stride can exceed the
     * image width, so the plane's rowStride is passed through — ignoring it
     * shears the image and breaks decoding on many devices.
     */
    private fun decode(proxy: ImageProxy): String? {
        val plane = proxy.planes.firstOrNull() ?: return null
        val buffer = plane.buffer
        val data = ByteArray(buffer.remaining())
        buffer.get(data)

        val source = PlanarYUVLuminanceSource(
            data,
            plane.rowStride,
            proxy.height,
            0,
            0,
            proxy.width,
            proxy.height,
            false,
        )

        val result: Result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
        val text = result.text
        return if (text.isNullOrEmpty()) null else text
    }

    private fun finishWithValue(value: String) {
        val data = Intent().apply {
            putExtra(EXTRA_QR_VALUE, value)
        }
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    private fun finishCanceled() {
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        try {
            cameraProvider?.unbindAll()
        } catch (err: Exception) {
            Log.d(TAG, "unbindAll during teardown: ${err.message}")
        }
        cameraProvider = null
        imageAnalysis = null
        analysisExecutor?.shutdown()
        analysisExecutor = null
        super.onDestroy()
    }

    /** dp -> px, for the programmatic padding above. */
    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val TAG = "ZxingQrScanner"

        /** Intent extra carrying the decoded payload back to the RN module. */
        const val EXTRA_QR_VALUE = "app.sidecoin.scanner.QR_VALUE"
    }
}
