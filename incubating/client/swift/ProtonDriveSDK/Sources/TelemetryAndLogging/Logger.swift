import Foundation

/// Callback for log events
public typealias LogCallback = @Sendable (LogEvent) -> Void

func logCallbackForTests(logEvent: LogEvent) {
    let timestamp = logEvent.timestamp.formatted(date: .abbreviated, time: .shortened)

    let prefix = "\(logEvent.level.symbol)[\(String(describing: logEvent.level).prefix(1).capitalized)][\(logEvent.thread)]"
    let logLine = "\(prefix)\(timestamp) \(logEvent.category): \(logEvent.message)"
    print(logLine)
}

extension LogLevel {
    var symbol: String {
        switch self {
        case .trace: "🟣"
        case .debug: "🔵"
        case .info: "🟢"
        case .warning: "⚠️"
        case .error: "❌"
        case .critical: "💣"
        case .none: ""
        }
    }
}

let cCompatibleLogCallback: CCallback = { statePointer, byteArray in
    guard let provider = SDKClientProvider.resolve(statePointer),
          let driveClient = provider.get() else { return }

    let logEvent = LogEvent(sdkLogEvent: Proton_Drive_Sdk_LogEvent(byteArray: byteArray))
    driveClient.log(logEvent)
}

final class Logger: Sendable {
    /// Callback provided by the SDK consumer
    let logCallback: LogCallback

    init(logCallback: @escaping LogCallback) async throws {
        self.logCallback = logCallback
    }

    func trace(_ message: String, category: String, file: String = #file, function: String = #function, line: UInt = #line) {
        self.log(level: .trace, message, category: category, file: file, function: function, line: line)
    }

    func debug(_ message: String, category: String, file: String = #file, function: String = #function, line: UInt = #line) {
        self.log(level: .debug, message, category: category, file: file, function: function, line: line)
    }

    func error(_ message: String, category: String) {
        self.log(level: .error, message, category: category)
    }

    func info(_ message: String, category: String) {
        self.log(level: .info, message, category: category)
    }

    func log(level: LogLevel, _ message: String, category: String, file: String = #file, function: String = #function, line: UInt = #line) {
        self.logCallback(
            LogEvent(level: level, message: message, category: category, thread: Thread.currentNumber, file: file, function: function, line: line)
        )
    }
}

extension Thread {
    /// NSThread's own thread number — the `number = N` in its description, as shown in
    /// log prefixes.
    ///
    /// Matches PDCore's `Thread.currentNumber`: the number is parsed once per thread and
    /// cached in the thread dictionary, so the per-log-call cost is a dictionary lookup
    /// instead of building a description string and matching a regex against it on every
    /// line. A thread's number does not change, so caching it is safe.
    ///
    /// Static rather than an instance property: the number and its cache both belong to
    /// the *calling* thread, so a receiver could only ever mislead — and caching through
    /// one would write into another thread's `threadDictionary`, which is not safe to
    /// mutate cross-thread.
    static var currentNumber: UInt {
        let storage = Thread.current.threadDictionary
        if let cached = storage["ProtonDriveSDK.threadNumber"] as? UInt {
            return cached
        }

        let description = Thread.current.description
        let number = description.range(of: "number = ").flatMap {
            UInt(description[$0.upperBound...].prefix(while: \.isNumber))
        } ?? 0

        storage["ProtonDriveSDK.threadNumber"] = number
        return number
    }
}
