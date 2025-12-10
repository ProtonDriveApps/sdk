import Foundation

/// Boxed task that can be cancelled via its memory address.
/// Retained via Unmanaged until completion or cancellation.
final class BoxedCancellableTask: @unchecked Sendable {
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

    func setCompletionHandler(_ handler: @escaping () -> Void) {
        lock.lock()
        defer { lock.unlock() }
        onComplete = handler
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
}
