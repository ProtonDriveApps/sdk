-keep class com.google.protobuf.** { *; }
-dontwarn com.google.protobuf.**
-keep class proton.sdk.** { *; }
-keep class proton.drive.sdk.** { *; }

# Keep Job signatures required by native code in job.c
-keep class kotlinx.coroutines.JobCancellationException
-keepclassmembers class kotlinx.coroutines.** {
    void cancel(...);
}
