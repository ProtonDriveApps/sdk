package me.proton.drive.sdk.internal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch

/** Runs tasks on a single consumer, in submission order; [close] still runs what is already queued. */
internal class TaskQueue(private val onError: (Exception) -> Unit) : AutoCloseable {

    private val scope = CoroutineScope(Job() + Dispatchers.Default)
    private val channel = Channel<() -> Unit>(Channel.UNLIMITED)

    private val consumer = scope.launch(start = CoroutineStart.LAZY) {
        // Draining before cancelling is what lets a task queued behind [close] still run.
        for (task in channel) runIsolated(task)
        scope.cancel()
    }

    @OptIn(DelicateCoroutinesApi::class)
    val isClosed: Boolean get() = channel.isClosedForSend

    fun submit(task: () -> Unit): Boolean {
        val submitted = channel.trySend(task).isSuccess
        if (submitted) {
            consumer.start()
        }
        return submitted
    }

    override fun close() {
        channel.close()
    }

    // A throwing task would end the consumer, leaving every later submit queued forever.
    private fun runIsolated(task: () -> Unit) = try {
        task()
    } catch (error: Exception) {
        onError(error)
    }
}
