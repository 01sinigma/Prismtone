# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep JavascriptInterface methods
-keepclassmembers class com.example.prismtone.PrismtoneBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep module classes
-keep class com.example.prismtone.BaseModule
-keep class com.example.prismtone.*Module
-keepclassmembers class com.example.prismtone.*Module {
    <init>(android.content.Context, com.example.prismtone.ModuleInfo);
}

# Keep Gson related classes
-keep class com.google.gson.** { *; }
-keep class * implements com.google.gson.TypeAdapter
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# WebView settings
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
