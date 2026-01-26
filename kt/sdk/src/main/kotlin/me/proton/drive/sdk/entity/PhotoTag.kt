package me.proton.drive.sdk.entity

enum class PhotoTag(val value: Long) {
    Favorites(0),
    Screenshots(1),
    Videos(2),
    LivePhotos(3),
    MotionPhotos(4),
    Selfies(5),
    Portraits(6),
    Bursts(7),
    Panoramas(8),
    Raw(9);

    companion object {
        fun fromLong(value: Long): PhotoTag? = entries.firstOrNull { entry -> entry.value == value }
    }
}
