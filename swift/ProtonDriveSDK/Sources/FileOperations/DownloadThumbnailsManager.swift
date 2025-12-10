import Foundation

/// Handles file download operations for ProtonDrive
actor DownloadThumbnailsManager {

    private let clientHandle: ObjectHandle
    private let logger: Logger?
    private var activeDownloads: [UUID: CancellationTokenSource] = [:]

    init(clientHandle: ObjectHandle, logger: Logger?) {
        self.clientHandle = clientHandle
        self.logger = logger
    }

    deinit {
        activeDownloads.values.forEach {
            $0.free()
        }
    }

    /// Download thumbnails for file UIDs
    func downloadThumbnails(
        fileUids: [SDKNodeUid],
        type: ThumbnailData.ThumbnailType,
        cancellationToken: UUID
    ) async throws -> [ThumbnailDataWithId] {
        let cancellationTokenSource = try await CancellationTokenSource(logger: logger)
        activeDownloads[cancellationToken] = cancellationTokenSource

        defer {
            if let cancellationTokenSource = activeDownloads[cancellationToken] {
                activeDownloads[cancellationToken] = nil
                cancellationTokenSource.free()
            }
        }

        let thumbnailsRequest = Proton_Drive_Sdk_DriveClientGetThumbnailsRequest.with {
            $0.clientHandle = Int64(clientHandle)
            $0.type = type.sdkType
            $0.fileUids = fileUids.map(\.sdkCompatibleIdentifier)
            $0.cancellationTokenSourceHandle = Int64(cancellationTokenSource.handle)
        }

        let thumbnailsList: Proton_Drive_Sdk_FileThumbnailList = try await SDKRequestHandler.send(
            thumbnailsRequest,
            logger: logger
        )
        return thumbnailsList.thumbnails.compactMap {
            ThumbnailDataWithId(fileThumbnail: $0)
        }
    }

    func cancelDownload(with cancellationToken: UUID) async throws {
        guard let downloadCancellationToken = activeDownloads[cancellationToken] else {
            throw ProtonDriveSDKError(interopError: .noCancellationTokenForIdentifier(operation: "thumbnails download"))
        }

        try await downloadCancellationToken.cancel()
        try await downloadCancellationToken.free()

        activeDownloads[cancellationToken] = nil
    }
}

private extension ThumbnailData.ThumbnailType {
    var sdkType: Proton_Drive_Sdk_ThumbnailType {
        switch self {
        case .preview:
            return .preview
        case .thumbnail:
            return .thumbnail
        }
    }
}
