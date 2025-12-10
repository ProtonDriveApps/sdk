actor CancellationTokenSource {
    let handle: ObjectHandle
    private let logger: ProtonDriveSDK.Logger?

    init(logger: ProtonDriveSDK.Logger?) async throws {
        self.logger = logger

        let request = Proton_Sdk_CancellationTokenSourceCreateRequest()
        self.handle = try await SDKRequestHandler.sendInteropRequest(request, logger: logger)

        logger?.trace("CancellationTokenSource.init, handle: \(String(describing: handle))", category: "Cancellation")
    }

    func cancel() async throws {
        logger?.trace("CancellationTokenSource.cancel, handle: \(String(describing: handle))", category: "Cancellation")

        try await SDKRequestHandler.sendInteropRequest(
            Proton_Sdk_CancellationTokenSourceCancelRequest.with {
                $0.cancellationTokenSourceHandle = Int64(handle)
            },
            logger: logger
        ) as Void
    }

    nonisolated func free() {
        logger?.trace("CancellationTokenSource.free, handle: \(String(describing: handle))", category: "Cancellation")
        let cancellationHandle = self.handle
        
        // CAUTION: Intentionally capturing `self` strongly here, because otherwise
        // this instance might get released before the async response from the SDK is received.
        var strongSelf: CancellationTokenSource? = self
        Task {
            let request = Proton_Sdk_CancellationTokenSourceFreeRequest.with {
                $0.cancellationTokenSourceHandle = Int64(cancellationHandle)
            }
            do {
                try await SDKRequestHandler.sendInteropRequest(request, logger: logger) as Void
                logger?.trace("CancellationTokenSource.free succeeded, handle: \(cancellationHandle) -> nil", category: "Cancellation")
            } catch {
                logger?.error("CancellationTokenSource.free failed, error: \(error)", category: "Cancellation")
            }
            strongSelf = nil
        }
    }
}
