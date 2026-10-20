package me.proton.drive.sdk

/**
 * Marks the experimental search API.
 *
 * It only works with a native library built with search included (`IncludeProtonDriveSearch=true`).
 * Against any other build, calls fail at runtime because the native library does not handle them.
 */
@RequiresOptIn(
    message = "Search is experimental and requires a native library built with search included.",
    level = RequiresOptIn.Level.ERROR,
)
@Retention(AnnotationRetention.BINARY)
@Target(AnnotationTarget.FUNCTION)
annotation class ExperimentalSearchApi
