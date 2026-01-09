package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope

internal typealias CoroutineScopeProvider = () -> CoroutineScope?
internal typealias CoroutineScopeConsumer = (CoroutineScope?) -> Unit
