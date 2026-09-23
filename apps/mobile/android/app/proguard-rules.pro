# packages/mobile/android/app/proguard-rules.pro

# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.**

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }

# Keep native methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.uimanager.annotations.ReactProp *;
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}

# Reanimated
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**

# Skia
-keep class com.shopify.reactnative.skia.** { *; }
-dontwarn com.shopify.reactnative.skia.**

# react-native-quick-crypto
-keep class com.nicholasgasior.** { *; }
-dontwarn com.nicholasgasior.**

# SQLite
-keep class net.nicholasgasior.** { *; }

# react-native-webview
#
# The library ships NO consumer ProGuard rules (verified: no
# consumer-rules.pro / proguard-rules.pro in the published package, and
# android/build.gradle declares no consumerProguardFiles). With
# minifyEnabled + shrinkResources true in release, R8 can strip or rename the
# WebView module and its codegen'd spec classes, which surfaces only in
# release builds as a null-module crash when <WebView> mounts. Keep the whole
# package explicitly.
-keep class com.reactnativecommunity.webview.** { *; }
-dontwarn com.reactnativecommunity.webview.**

# OkHttp (used by RN networking)
-dontwarn okhttp3.**
-dontwarn okio.**
