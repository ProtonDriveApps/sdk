import Foundation

public protocol OperationalResilience: Sendable {
    func performRetry<T>(
        _ retryCounter: UInt, _ error: Error, _ work: @Sendable (UInt) async throws -> T
    ) async throws -> T
}

public final class BasicOperationalResilience: OperationalResilience, Sendable {

    public static let `default` = BasicOperationalResilience()
    
    public static let noop = BasicOperationalResilience(maxRetries: 0)
    
    private let maxRetries: UInt
    private let baseRetryDurationInMilliseconds: Double
    private let jitterFactor: Double
    
    public init(maxRetries: UInt = 5,
                baseRetryDurationInMilliseconds: Double = 30_000.0, /* 30 s */
                jitterFactor: Double = 0.1 /* max 3s jitter */) {
        self.maxRetries = maxRetries
        self.baseRetryDurationInMilliseconds = baseRetryDurationInMilliseconds
        self.jitterFactor = jitterFactor
    }
    
    public func performRetry<T>(
        _ retryCounter: UInt, _ previousError: Error, _ work: @Sendable (UInt) async throws -> T
    ) async throws -> T {
        
        guard retryCounter < maxRetries else {
            throw previousError
        }
        
        let maxJitterInMilliseconds: Double = jitterFactor * baseRetryDurationInMilliseconds
        let jitterInMilliseconds = Double.random(in: 0.0...maxJitterInMilliseconds)
        let retryDurationInMilliseconds = Int(baseRetryDurationInMilliseconds + jitterInMilliseconds)
        do {
            try await Task.sleep(for: .milliseconds(retryDurationInMilliseconds))
        } catch {
            // we don't care about the task sleep error
            throw previousError
        }
        return try await work(retryCounter + 1)
    }
}
