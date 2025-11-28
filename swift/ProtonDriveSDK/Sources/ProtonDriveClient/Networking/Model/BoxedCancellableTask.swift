import Foundation

/// Boxed task that can be cancelled via its memory address.
/// Retained via Unmanaged until completion or cancellation.
final class BoxedCancellableTask: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    private var onComplete: (() -> Void)?

    init(work: @escaping @Sendable () async throws -> Void) {
        task = Task { [weak self] in
            defer {
                self?.onComplete?()
            }
            try? await work()
        }
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
