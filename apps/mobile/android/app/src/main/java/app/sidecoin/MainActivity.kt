// packages/mobile/android/app/src/main/java/app/sidecoin/MainActivity.kt

package app.sidecoin

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    /**
     * Returns the name of the main component registered from JavaScript.
     * This is used to schedule rendering of the component.
     * Must match the name used in AppRegistry.registerComponent() in index.js.
     */
    override fun getMainComponentName(): String = "Sidecoin"

    /**
     * Returns the instance of the [ReactActivityDelegate]. We use
     * [DefaultReactActivityDelegate] which allows you to enable
     * New Architecture with a single boolean flag [fabricEnabled].
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
