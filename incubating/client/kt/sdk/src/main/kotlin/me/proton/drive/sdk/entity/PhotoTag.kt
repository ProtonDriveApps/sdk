package me.proton.drive.sdk.entity

enum class PhotoTag(val value: Long) {
    Favorite(0),
    Screenshot(1),
    Video(2),
    LivePhoto(3),
    MotionPhoto(4),
    Selfie(5),
    Portrait(6),
    Burst(7),
    Panorama(8),
    Raw(9);

    companion object {
        fun fromLong(value: Long): PhotoTag? = entries.firstOrNull { entry -> entry.value == value }
    }
}
