import Foundation
import SwiftProtobuf

/// Protocol to be implemented by object making http requests.
public protocol HttpClientProtocol: AnyObject, Sendable {
    func identifyRequestType(url: String, method: String) -> RequestType

    /// Drive api calls (takes `/drive/...` path)
    func requestDriveApi(
        method: String,
        relativePath: String,
        content: Data,
        headers: [(String, [String])]
    ) async -> Result<HttpClientResponse, NSError>

    /// Raw request (takes whole url) - should be storage request
    func requestUploadToStorage(
        method: String,
        url: String,
        content: StreamForUpload,
        headers: [(String, [String])]
    ) async -> Result<HttpClientResponse, NSError>

    func requestDownloadFromStorage(
        method: String,
        url: String,
        content: Data,
        headers: [(String, [String])],
        downloadStreamCreator: @Sendable @escaping (URLSession.AsyncBytes) -> AnyAsyncSequence<UInt8>
    ) async -> Result<HttpClientStream, NSError>
}

public enum RequestType {
    case driveAPI(relativePath: String)
    case uploadToStorage
    case downloadFromStorage
}

public struct HttpClientResponse {
    public let data: Data?
    public let headers: [(String, [String])]
    public let statusCode: Int

    public init(data: Data?, headers: [(String, [String])], statusCode: Int) {
        self.data = data
        self.headers = headers
        self.statusCode = statusCode
    }
}

public struct HttpClientStream {
    public let stream: AnyAsyncSequence<UInt8>
    public let headers: [(String, [String])]
    public let statusCode: Int

    public init(
        stream: AnyAsyncSequence<UInt8>,
        headers: [(String, [String])],
        statusCode: Int
    ) {
        self.stream = stream
        self.headers = headers
        self.statusCode = statusCode
    }
}

public struct AnyAsyncSequence<Element>: AsyncSequence {
    public typealias AsyncIterator = AnyAsyncIterator<Element>
    public typealias Element = Element
    
    private let internalMakeAsyncIterator: () -> AnyAsyncIterator<Element>
    
    public init<S: AsyncSequence>(_ sequence: S) where S.Element == Element {
        internalMakeAsyncIterator = {
            AnyAsyncIterator(iterator: sequence.makeAsyncIterator())
        }
    }
    
    public func makeAsyncIterator() -> AnyAsyncIterator<Element> {
        internalMakeAsyncIterator()
    }
}

public struct AnyAsyncIterator<Element>: AsyncIteratorProtocol {
    public typealias Element = Element
    
    private final class IteratorBox<I: AsyncIteratorProtocol>: @unchecked Sendable {
        var iterator: I
        init(_ iterator: I) { self.iterator = iterator }
    }
    
    private var internalNext: () async throws -> Element?
    private var internalNextIsolated: (isolated (any Actor)?) async throws -> Element?
    
    public init<Iterator: AsyncIteratorProtocol>(iterator: Iterator) where Iterator.Element == Element {
        let box = IteratorBox(iterator)
        internalNext = { try await box.iterator.next() }
        internalNextIsolated = {
            if #available(macOS 15.0, iOS 18.0, watchOS 11.0, tvOS 18.0, visionOS 2.0, *) {
                try await box.iterator.next(isolation: $0)
            } else {
                fatalError("This method is not available on older OS versions.")
            }
        }
    }
    
    public mutating func next() async throws -> Element? {
        try await internalNext()
    }
    
    @available(macOS 15.0, iOS 18.0, watchOS 11.0, tvOS 18.0, visionOS 2.0, *)
    public func next(isolation actor: isolated (any Actor)?) async throws -> Element? {
        try await internalNextIsolated(actor)
    }
}
