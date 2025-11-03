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

/// Class containing a continuation - for when a continuation needs to be accessible by memory address
final class BoxedContinuation<ResultType>: Resumable {
    private var continuation: Continuation?
    
    let context: Any = Void()

    init(_ continuation: Continuation) {
        self.continuation = continuation
    }
    
    func resume(returning value: sending ResultType) {
        guard let continuation else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        continuation.resume(returning: value)
        self.continuation = nil
    }

    func resume(throwing error: any Error) {
        guard let continuation else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        continuation.resume(throwing: error)
        self.continuation = nil
    }
}

final class BoxedContinuationWithState<ResultType, StateType>: Resumable {
    typealias Continuation = CheckedContinuation<ResultType, any Error>

    private var continuation: Continuation?
    let state: StateType
    let context: Any

    init(_ continuation: Continuation, state: StateType, context: Any) {
        self.continuation = continuation
        self.state = state
        self.context = context
    }
    
    init<WeakStateType>(_ continuation: Continuation, weakState state: WeakStateType, context: Any)
    where StateType == WeakReference<WeakStateType> {
        self.continuation = continuation
        self.state = WeakReference(value: state)
        self.context = context
    }
    
    func resume(returning value: sending ResultType) {
        guard let continuation else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        continuation.resume(returning: value)
        self.continuation = nil
    }

    func resume(throwing error: any Error) {
        guard let continuation else {
            assertionFailure("Attempt at calling continuation twice, programmer's error, must fix")
            return
        }
        continuation.resume(throwing: error)
        self.continuation = nil
    }
}
