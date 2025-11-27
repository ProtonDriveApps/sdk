public struct ProtonDriveClientConfiguration: Sendable {
    #if os(iOS)
    public static let `default` = ProtonDriveClientConfiguration(httpTransferBufferSize: 64 * 1024)
    #else
    public static let `default` = ProtonDriveClientConfiguration(httpTransferBufferSize: 4 * 1024 * 1024)
    #endif

    let httpTransferBufferSize: Int // Used for establishing buffer for http streams

    public init(httpTransferBufferSize: Int) {
        self.httpTransferBufferSize = httpTransferBufferSize
    }
}
