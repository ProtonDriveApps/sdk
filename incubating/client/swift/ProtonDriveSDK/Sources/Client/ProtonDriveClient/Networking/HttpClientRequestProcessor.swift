import Foundation

enum HttpClientRequestProcessor {
    static let cCompatibleHttpRequest: CCallbackWithCallbackPointerAndObjectPointerReturn = { statePointer, byteArray, callbackPointer in
        guard let provider = SDKClientProvider.resolve(statePointer) else {
            SDKResponseHandler.sendInteropErrorToSDK(message: "Client callback state has been released",
                                                     callbackPointer: callbackPointer, assert: false)
            return -1
        }
        guard let driveClient = provider.get(callbackPointer: callbackPointer) else { return -1 }

        let httpRequestData = Proton_Drive_Sdk_HttpRequest(byteArray: byteArray)
        
        return BoxedCancellableTask.registered {
            do {
                try await HttpClientRequestProcessor.perform(
                    client: driveClient,
                    httpRequestData: httpRequestData,
                    callbackPointer: callbackPointer,
                    provider: provider
                )
            } catch {
                SDKResponseHandler.sendErrorToSDK(error, callbackPointer: callbackPointer)
            }
        }
    }
    
    static let cCompatibleHttpCancellationAction: CCallbackWithoutByteArray = { callbackHandle in
        CallbackHandleRegistry.shared.cancel(callbackHandle)
    }

    fileprivate static func perform(
        client: ProtonSDKClient,
        httpRequestData: Proton_Drive_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {

        switch httpRequestData.type {
        case .regularApi:
            guard let relativeApiPath = httpRequestData.url.split(separator: "/drive/").last else {
                fatalError("The regular API calls must always have the '/drive/' prefix in the path")
            }
            try await callDriveApi(
                driveRelativePath: "/drive/" + relativeApiPath,
                client: client,
                httpRequestData: httpRequestData,
                callbackPointer: callbackPointer,
                provider: provider
            )
        case .storageUpload:
            try await uploadToStorage(
                client: client,
                httpRequestData: httpRequestData,
                callbackPointer: callbackPointer,
                provider: provider
            )
        case .smallUpload:
            try await smallUpload(
                client: client,
                httpRequestData: httpRequestData,
                callbackPointer: callbackPointer,
                provider: provider
            )
        case .storageDownload:
            try await downloadFromStorage(
                client: client,
                httpRequestData: httpRequestData,
                callbackPointer: callbackPointer,
                provider: provider
            )
        case .UNRECOGNIZED(let int):
            fatalError("Unknown HttpRequestType: \(int)")
        }
    }

    /// the API calls are performed in a non-streaming way. both request body and response data are buffered in memory
    fileprivate static func callDriveApi(
        driveRelativePath: String,
        client: ProtonSDKClient,
        httpRequestData: Proton_Drive_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {
        let headers: [(String, [String])] = httpRequestData.headers.map { header in
            (header.name, header.values)
        }
        var contentData = Data()
        if httpRequestData.hasSdkContentHandle {
            // the API calls are performed in a non-streaming way,
            // so we buffer all request data in-memory before making a call
            let bufferLength = client.configuration.httpTransferBufferSize
            let buffer = UnsafeMutableRawBufferPointer.allocate(byteCount: bufferLength, alignment: MemoryLayout<UInt8>.alignment)
            let baseAddress = buffer.baseAddress!

            while true {
                let streamReadRequest = Proton_Drive_Sdk_StreamReadRequest.with {
                    $0.bufferLength = Int32(buffer.count)
                    $0.bufferPointer = Int64(ObjectHandle(rawPointer: UnsafeRawPointer(baseAddress)))
                    $0.streamHandle = httpRequestData.sdkContentHandle
                }
                let read: Int32 = try await SDKRequestHandler.send(streamReadRequest, logger: client.logger)
                let dataFromThisRead = Data(bytes: baseAddress, count: Int(read))
                contentData.append(dataFromThisRead)
                if read == 0 {
                    break
                }
            }
            buffer.deallocate()
        }

        let response = try await client.httpClient.requestDriveApi(
            method: httpRequestData.method,
            relativePath: driveRelativePath,
            content: contentData,
            headers: headers
        ).get()

        // the API calls are performed in a non-streaming way, we have whole data cached in-memory,
        // so we prepare a buffer that holds everything and wrap it into offset-keeping box
        sendBufferedResponse(response, callbackPointer: callbackPointer, provider: provider, logger: client.logger)
    }

    /// the storage upload calls are using stream to upload request body, but cache the whole response in memory
    fileprivate static func uploadToStorage(
        client: ProtonSDKClient,
        httpRequestData: Proton_Drive_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {
        let headers: [(String, [String])] = httpRequestData.headers.map { header in
            (header.name, header.values)
        }

        guard httpRequestData.hasSdkContentHandle else {
            SDKResponseHandler.sendInteropErrorToSDK(
                message: "Proton_Drive_Sdk_HttpRequest.sdk_content_handle is missing",
                callbackPointer: callbackPointer
            )
            return
        }
        
        let (inputStream, outputStream, bufferLength) = try client.configuration.boundStreamsCreator()
        let stream = try StreamForUpload(
            inputStream: inputStream,
            outputStream: outputStream,
            bufferLength: bufferLength,
            sdkContentHandle: httpRequestData.sdkContentHandle,
            logger: client.logger
        )

        let response = try await client.httpClient.requestUploadToStorage(
            method: httpRequestData.method,
            url: httpRequestData.url,
            content: stream,
            headers: headers
        ).get()

        sendBufferedResponse(response, callbackPointer: callbackPointer, provider: provider, logger: client.logger)
    }

    fileprivate static func smallUpload(
        client: ProtonSDKClient,
        httpRequestData: Proton_Drive_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {
        let response = try await performSmallUpload(
            request: httpRequestData,
            httpClient: client.httpClient,
            bufferLength: client.configuration.httpTransferBufferSize,
            read: { try await SDKRequestHandler.send($0, logger: client.logger) }
        )
        sendBufferedResponse(response, callbackPointer: callbackPointer, provider: provider, logger: client.logger)
    }

    static func performSmallUpload(
        request: Proton_Drive_Sdk_HttpRequest,
        httpClient: any HttpClientProtocol,
        bufferLength: Int,
        read: (Proton_Drive_Sdk_StreamReadRequest) async throws -> Int32
    ) async throws -> HttpClientResponse {
        if Task.isCancelled { throw URLError(.cancelled) }
        guard !request.firstMultipartJsonContent.isEmpty else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "Upload details are missing."))
        }
        guard request.hasSdkContentHandle, request.sdkContentHandle != 0 else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "Upload data is unavailable."))
        }
        let maximumBodySize = 16 * 1024 * 1024
        guard bufferLength > 0 else {
            throw ProtonDriveSDKError(interopError: .wrongResult(message: "The upload configuration is invalid."))
        }
        let bufferLength = min(bufferLength, maximumBodySize)
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferLength)
        defer { buffer.deallocate() }
        var content = Data()
        let readRequest = Proton_Drive_Sdk_StreamReadRequest.with {
            $0.streamHandle = request.sdkContentHandle
            $0.bufferPointer = Int64(ObjectHandle(rawPointer: UnsafeRawPointer(buffer)))
            $0.bufferLength = Int32(bufferLength)
        }
        while true {
            if Task.isCancelled { throw URLError(.cancelled) }
            let count = try await read(readRequest)
            if Task.isCancelled { throw URLError(.cancelled) }
            guard count >= 0, count <= bufferLength else {
                throw ProtonDriveSDKError(interopError: .wrongResult(message: "The upload data could not be read correctly."))
            }
            if count == 0 { break }
            guard content.count <= maximumBodySize - Int(count) else {
                throw ProtonDriveSDKError(interopError: .wrongResult(message: "The upload exceeds the supported size."))
            }
            content.append(buffer, count: Int(count))
        }
        return try await httpClient.requestSmallUpload(
            method: request.method,
            url: request.url,
            content: content,
            metadata: request.firstMultipartJsonContent,
            headers: request.headers.map { ($0.name, $0.values) }
        ).get()
    }

    private static func sendBufferedResponse(
        _ response: HttpClientResponse,
        callbackPointer: Int,
        provider: SDKClientProvider,
        logger: Logger
    ) {
        let bindingsHandle: Int?
        if let data = response.data, !data.isEmpty {
            let uploadBuffer = BoxedRawBuffer(bufferSize: data.count, logger: logger)
            uploadBuffer.copyBytes(from: data)
            bindingsHandle = CallbackHandleRegistry.shared.register(
                BoxedStreamingData(uploadBuffer: uploadBuffer, logger: logger),
                scope: .ownerManaged,
                owner: provider
            )
        } else {
            bindingsHandle = nil
        }
        let httpResponse = Proton_Drive_Sdk_HttpResponse.with {
            $0.headers = response.headers.map { header in
                Proton_Drive_Sdk_HttpHeader.with {
                    $0.name = header.0
                    $0.values = header.1
                }
            }
            if let bindingsHandle { $0.bindingsContentHandle = Int64(bindingsHandle) }
            $0.statusCode = Int32(response.statusCode)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: httpResponse)
    }

    /// the download upload calls are caching the whole request body in-memory, but stream the response data
    fileprivate static func downloadFromStorage(
        client: ProtonSDKClient,
        httpRequestData: Proton_Drive_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {
        let headers: [(String, [String])] = httpRequestData.headers.map { header in
            (header.name, header.values)
        }
        
        var contentData = Data()
        if httpRequestData.hasSdkContentHandle {
            // We expect that request data to be small, we need to fetch them whole
            let bufferLength = client.configuration.httpTransferBufferSize
            let buffer = UnsafeMutableRawBufferPointer.allocate(byteCount: bufferLength, alignment: MemoryLayout<UInt8>.alignment)
            let baseAddress = buffer.baseAddress!
            
            while true {
                let streamReadRequest = Proton_Drive_Sdk_StreamReadRequest.with {
                    $0.bufferLength = Int32(buffer.count)
                    $0.bufferPointer = Int64(ObjectHandle(rawPointer: UnsafeRawPointer(baseAddress)))
                    $0.streamHandle = httpRequestData.sdkContentHandle
                }
                let read: Int32 = try await SDKRequestHandler.send(streamReadRequest, logger: client.logger)
                let dataFromThisRead = Data(bytes: baseAddress, count: Int(read))
                contentData.append(dataFromThisRead)
                if read == 0 {
                    break
                }
            }
            buffer.deallocate()
        }
        
        let response = try await client.httpClient.requestDownloadFromStorage(
            method: httpRequestData.method,
            url: httpRequestData.url,
            content: contentData,
            headers: headers,
            downloadStreamCreator: client.configuration.downloadStreamCreator
        ).get()

        let boxedStreamingData: BoxedStreamingData
        switch response.source {
        case let .stream(stream):
            boxedStreamingData = BoxedStreamingData(downloadStream: stream, logger: client.logger)
        case let .file(fileHandle):
            boxedStreamingData = BoxedStreamingData(downloadFileHandle: fileHandle, logger: client.logger)
        }
        let bindingsHandle = CallbackHandleRegistry.shared.register(boxedStreamingData, scope: .ownerManaged, owner: provider)
        let httpResponse = Proton_Drive_Sdk_HttpResponse.with {
            $0.headers = response.headers.map { header in
                Proton_Drive_Sdk_HttpHeader.with {
                    $0.name = header.0
                    $0.values = header.1
                }
            }
            $0.bindingsContentHandle = Int64(bindingsHandle)
            $0.statusCode = Int32(response.statusCode)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: httpResponse)
    }
}
