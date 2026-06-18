package me.proton.drive.sdk.entity

import kotlinx.serialization.json.JsonElement

data class AdditionalMetadataProperty(
    val name: String,
    val value: JsonElement,
)
