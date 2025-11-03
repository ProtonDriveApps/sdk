import Foundation

public struct LogEvent: Sendable {
    public let level: LogLevel
    public let message: String
    public let category: LogCategory
    public let timestamp: Date

    public let thread: UInt?
    public let file: String
    public let function: String
    public let line: UInt

    public init(level: LogLevel, message: String, category: LogCategory, timestamp: Date = Date(), thread: UInt?, file: String, function: String, line: UInt) {
        self.level = level
        self.message = message
        self.category = category
        self.timestamp = timestamp

        self.thread = thread
        self.file = file
        self.function = function
        self.line = line
    }

    init(sdkLogEvent: Proton_Sdk_LogEvent) {
        self.init(
            level: LogLevel(sdkLogEvent.level),
            message: sdkLogEvent.message,
            category: LogCategory(sdkLogEvent.categoryName),
            thread: 0,
            // TODO: extract this from SDK error
            file: "n/a",
            function: "n/a",
            line: 0
        )
    }
}

/// https://learn.microsoft.com/en-us/dotnet/api/microsoft.extensions.logging.loglevel
public enum LogLevel: Int32, Sendable {
    case trace = 0
    case debug = 1
    case info = 2
    case warning = 3
    case error = 4
    case critical = 5
    case none = 6

    public init(_ rawValue: Int32) {
        self = LogLevel(rawValue: rawValue) ?? .debug
    }
}

public enum LogCategory: Sendable {
    case other(String)
    case upload
    case download
    case cancellation
    case logging

    init(_ categoryName: String) {
        switch categoryName {
        case "upload": self = .upload
        case "download": self = .download
        case "cancellation": self = .cancellation
        case "logging": self = .logging
        default: self = .other(categoryName)
        }
    }
}
