import Foundation

public struct ProtonDriveClientConfiguration: Sendable {
    #if os(iOS)
    @usableFromInline static let defaultHttpTransportBufferSize = 64 * 1024
    #else
    @usableFromInline static let defaultHttpTransportBufferSize = 4 * 1024 * 1024
    #endif
    
    public static let defaultBoundStreamsCreator: @Sendable () throws -> (InputStream, OutputStream, Int) = {
        let bufferSize = defaultHttpTransportBufferSize
        var inputOrNil: InputStream? = nil
        var outputOrNil: OutputStream? = nil
        Stream.getBoundStreams(withBufferSize: bufferSize,
                               inputStream: &inputOrNil,
                               outputStream: &outputOrNil)
        guard let input = inputOrNil, let output = outputOrNil else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "Cannot make stream"))
        }
        return (input, output, bufferSize)
    }
    
    @usableFromInline static let defaultDownloadStreamCreator: @Sendable (URLSession.AsyncBytes) -> AnyAsyncSequence<UInt8> = AnyAsyncSequence.init
    
    let baseURL: String
    let clientUID: String
    let httpTransferBufferSize: Int // Used for establishing buffer for http streams
    
    let entityCachePath: String?
    let secretCachePath: String?
    
    let boundStreamsCreator: @Sendable () throws -> (InputStream, OutputStream, Int)
    let downloadStreamCreator: @Sendable (URLSession.AsyncBytes) -> AnyAsyncSequence<UInt8>

    public init(
        baseURL: String,
        clientUID: String,
        httpTransferBufferSize: Int = defaultHttpTransportBufferSize,
        boundStreamsCreator: @Sendable @escaping () throws -> (InputStream, OutputStream, Int) = defaultBoundStreamsCreator,
        downloadStreamCreator: @Sendable @escaping (URLSession.AsyncBytes) -> AnyAsyncSequence<UInt8> = defaultDownloadStreamCreator,
        entityCachePath: String? = nil,
        secretCachePath: String? = nil
    ) {
        self.baseURL = baseURL
        self.clientUID = clientUID
        self.httpTransferBufferSize = httpTransferBufferSize
        self.boundStreamsCreator = boundStreamsCreator
        self.downloadStreamCreator = downloadStreamCreator
        self.entityCachePath = entityCachePath
        self.secretCachePath = secretCachePath
    }
}
