import Foundation

/// Origin point for seek operations
public enum SeekOrigin: Int32, Sendable {
    /// Seek from the beginning of the stream
    case begin = 0
    /// Seek relative to the current position
    case current = 1
    /// Seek relative to the end of the stream
    case end = 2
}

/// A protocol for output streams that support seeking.
/// Used for download operations that may need to resume from a specific position.
public protocol SeekableOutputStream: AnyObject, Sendable {
    /// Writes data to the stream.
    /// - Parameter data: The data to write
    /// - Throws: An error if the write operation fails
    func write(_ data: Data) throws

    /// Seeks to a position in the stream.
    /// - Parameters:
    ///   - offset: The offset to seek to
    ///   - origin: The origin point for the seek operation
    /// - Returns: The new position in the stream
    /// - Throws: An error if the seek operation fails
    func seek(offset: Int64, origin: SeekOrigin) throws -> Int64

    /// Flushes any buffered data to the underlying storage.
    /// - Throws: An error if the flush operation fails
    func flush() throws

    /// Closes the stream.
    /// - Throws: An error if the close operation fails
    func close() throws
}

/// A seekable output stream implementation backed by a FileHandle.
public final class FileSeekableOutputStream: SeekableOutputStream, @unchecked Sendable {
    enum Error: Swift.Error {
        case failedToCreateFile
        case invalidSeekPosition
    }

    private let fileHandle: FileHandle
    private let lock = NSLock()

    /// Creates a new FileSeekableOutputStream for the given file URL.
    /// - Parameter fileURL: The URL of the file to write to
    /// - Throws: An error if the file cannot be opened for writing
    public init(fileURL: URL) throws {
        // If file already exists, operation still succeeds
        if !FileManager.default.createFile(atPath: fileURL.path, contents: nil) {
            throw Error.failedToCreateFile
        }

        self.fileHandle = try FileHandle(forWritingTo: fileURL)
    }

    /// Creates a new FileSeekableOutputStream for the given file handle.
    /// - Parameter fileHandle: The file handle to write to
    public init(fileHandle: FileHandle) {
        self.fileHandle = fileHandle
    }

    public func write(_ data: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        try fileHandle.write(contentsOf: data)
    }

    public func seek(offset: Int64, origin: SeekOrigin) throws -> Int64 {
        lock.lock()
        defer { lock.unlock() }

        let basePosition: Int64 = switch origin {
        case .begin:
            0
        case .current:
            Int64(try fileHandle.offset())
        case .end:
            Int64(try fileHandle.seekToEnd())
        }

        let newPosition = basePosition + offset
        guard newPosition >= 0 else {
            throw Error.invalidSeekPosition
        }

        try fileHandle.seek(toOffset: UInt64(newPosition))
        return newPosition
    }

    public func flush() throws {
        lock.lock()
        defer { lock.unlock() }
        try fileHandle.synchronize()
    }

    public func close() throws {
        lock.lock()
        defer { lock.unlock() }
        try fileHandle.close()
    }
}
