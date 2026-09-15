import Foundation

protocol Resumable<ReturnType>: AnyObject {
    associatedtype ReturnType
    typealias Continuation = CheckedContinuation<ReturnType, any Error>

    func resume(returning value: sending ReturnType)
    func resume(throwing error: Error)
}

extension Resumable where ReturnType == Void {
    func resume() {
        self.resume(returning: ())
    }
}

// Boxed completion
final class BoxedCompletionBlock<ResultType, StateType>: Resumable {
    typealias CompletionBlock = (Result<ResultType, Error>) -> Void

    private let lock = NSLock()
    private var completionBlock: CompletionBlock?
    let state: StateType

    init(_ completionBlock: CompletionBlock?, state: StateType) {
        self.completionBlock = completionBlock
        self.state = state
    }

    private func takeCompletion() -> CompletionBlock? {
        lock.lock()
        let completion = completionBlock
        completionBlock = nil
        lock.unlock()
        return completion
    }

    func resume(returning value: ResultType) {
        takeCompletion()?(.success(value))
    }

    func resume(throwing error: any Error) {
        takeCompletion()?(.failure(error))
    }
}
