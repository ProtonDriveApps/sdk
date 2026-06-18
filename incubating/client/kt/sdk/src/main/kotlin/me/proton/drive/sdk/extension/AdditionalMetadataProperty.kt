package me.proton.drive.sdk.extension

import kotlinx.serialization.json.Json
import me.proton.drive.sdk.entity.AdditionalMetadataProperty
import proton.drive.sdk.ProtonDriveSdk

fun ProtonDriveSdk.AdditionalMetadataProperty.toEntity() = AdditionalMetadataProperty(
    name = name,
    value = Json.parseToJsonElement(utf8JsonValue.toStringUtf8()),
)
