import Foundation

/// Boxed task that can be cancelled via its memory address.
/// Retained via Unmanaged until completion or cancellation.
final class BoxedCancellableTask: RegistryCancellable, @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    private var onComplete: (() -> Void)?

    init(work: @escaping @Sendable () async -> Void) {
        self.task = Task { [weak self] in
            defer {
                self?.complete()
            }
            await work()
        }
    }

    private func complete() {
        lock.lock()
        let completionHandler = onComplete
        task = nil
        onComplete = nil
        lock.unlock()
        // Call completion handler since we're done with this task box (to release it)
        completionHandler?()
    }

    fileprivate func setCompletionHandler(_ handler: @escaping () -> Void) {
        lock.lock()
        if task == nil {
            // Task already completed/cancelled before the handler was set.
            lock.unlock()
            handler()
            return
        }
        onComplete = handler
        lock.unlock()
    }

    func cancel() {
        lock.lock()
        let taskToCancel = task
        let completionHandler = onComplete
        task = nil
        onComplete = nil
        lock.unlock()

        taskToCancel?.cancel()
        // Call completion handler since we're done with this task box (to release it)
        completionHandler?()
    }

    /// Creates a task that auto-registers in the shared registry and auto-removes on completion or cancellation.
    static func registered(
        work: @escaping @Sendable () async -> Void
    ) -> RegistryHandle {
        let (_, handleId) = CallbackHandleRegistry.shared.registerTask(work: work)
        return handleId
    }
}

extension CallbackHandleRegistry {
    /// Registers a cancellable task that auto-removes itself on completion or cancellation.
    ///
    /// This is the preferred way to register short-lived async work. It wires up the
    /// cleanup handler so callers don't need to coordinate `register` / `remove` manually.
    func registerTask(
        work: @escaping @Sendable () async -> Void
    ) -> (BoxedCancellableTask, RegistryHandle) {
        let taskBox = BoxedCancellableTask(work: work)
        let handleId = register(taskBox, scope: .operation)
        taskBox.setCompletionHandler {
            self.remove(handleId)
        }
        return (taskBox, handleId)
    }
}
