import Foundation
import SwiftProtobuf

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
    public let stream: URLSession.AsyncBytes
    public let headers: [(String, [String])]
    public let statusCode: Int

    public init(stream: URLSession.AsyncBytes, headers: [(String, [String])], statusCode: Int) {
        self.stream = stream
        self.headers = headers
        self.statusCode = statusCode
    }
}

public enum RequestType {
    case driveAPI(relativePath: String)
    case uploadToStorage
    case downloadFromStorage
}

/// Protocol to be implemented by object making http requests.
public protocol HttpClientProtocol: AnyObject, Sendable {
    func getRelativeDrivePath(url: String, method: String) -> RequestType

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
        headers: [(String, [String])]
    ) async -> Result<HttpClientStream, NSError>
}
