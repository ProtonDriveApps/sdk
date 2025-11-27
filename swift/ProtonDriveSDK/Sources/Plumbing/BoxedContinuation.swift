protocol Resumable<ReturnType>: AnyObject {
    associatedtype ReturnType
    typealias Continuation = CheckedContinuation<ReturnType, any Error>

    func resume(returning value: sending ReturnType)
    func resume(throwing error: Error)
    
    var context: Any { get }
}

extension Resumable where ReturnType == Void {
    func resume() {
        self.resume(returning: ())
    }
}

// Boxed completion
final class BoxedCompletionBlock<ResultType, StateType>: Resumable {
    typealias CompletionBlock = (Result<ResultType, Error>) -> Void

    private var completionBlock: CompletionBlock?
    let state: StateType
    let context: Any

    init(_ completionBlock: CompletionBlock?, state: StateType, context: Any) {
        self.completionBlock = completionBlock
        self.state = state
        self.context = context
    }

    init<WeakStateType>(_ completionBlock: CompletionBlock?, weakState state: WeakStateType, context: Any)
    where StateType == WeakReference<WeakStateType> {
        self.completionBlock = completionBlock
        self.state = WeakReference(value: state)
        self.context = context
    }

    func resume(returning value: ResultType) {
        guard let completionBlock else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        completionBlock(.success(value))
        self.completionBlock = nil
    }

    func resume(throwing error: any Error) {
        guard let completionBlock else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        completionBlock(.failure(error))
        self.completionBlock = nil
    }
}
