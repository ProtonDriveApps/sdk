import Foundation

/// Callback for log events
public typealias LogCallback = @Sendable (LogEvent) -> Void


func logCallbackForTests(logEvent: LogEvent) {
    let timestamp = logEvent.timestamp.formatted(date: .abbreviated, time: .shortened)

    let prefix = "\(logEvent.level.symbol)[\(String(describing: logEvent.level).prefix(1).capitalized)][\(logEvent.thread ?? 0)]"
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

let cCompatibleLogCallback: CCallback = { state, byteArray in
    guard let state else {
        return
    }

//    let logEvent = LogEvent(sdkLogEvent: Proton_Sdk_LogEvent(byteArray: byteArray))
//
//    let continuationBox = Unmanaged<BoxedContinuationWithState<Int, ProtonDriveClient>>.fromOpaque(state).takeUnretainedValue()
//    let driveClient: ProtonDriveClient = continuationBox.state
//
//    driveClient.log(logEvent)
}

final class Logger: Sendable {
    /// Callback provided by the SDK consumer
    let logCallback: LogCallback

    init(logCallback: @escaping LogCallback) async throws {
        self.logCallback = logCallback
    }

    func trace(_ message: String, category: LogCategory, file: String = #file, function: String = #function, line: UInt = #line) {
        self.log(level: .trace, message, category: category)
    }

    func debug(_ message: String, category: LogCategory) {
        self.log(level: .debug, message, category: category)
    }

    func error(_ message: String, category: LogCategory) {
        self.log(level: .error, message, category: category)
    }

    func info(_ message: String, category: LogCategory) {
        self.log(level: .info, message, category: category)
    }

    func log(level: LogLevel, _ message: String, category: LogCategory, file: String = #file, function: String = #function, line: UInt = #line) {
        self.logCallback(
            LogEvent(level: level, message: message, category: category, thread: Thread.current.number, file: file, function: function, line: line)
        )
    }
}

extension Thread {
    var number: UInt {
        guard let match = Thread.current.description.firstMatch(of: #/number = (\d+)/#), let number = UInt(match.output.1) else {
            return 0
        }
        return number
    }
}
