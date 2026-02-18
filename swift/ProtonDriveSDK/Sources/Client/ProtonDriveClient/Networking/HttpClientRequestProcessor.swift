import Foundation

enum HttpClientRequestProcessor {
    static let cCompatibleHttpRequest: CCallbackWithCallbackPointerAndObjectPointerReturn = { statePointer, byteArray, callbackPointer in
        guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
            SDKResponseHandler.sendInteropErrorToSDK(message: "cCompatibleHttpRequest.statePointer was nil",
                                                     callbackPointer: callbackPointer)
            return -1
        }
        let stateTypedPointer = Unmanaged<BoxedCompletionBlock<Int, SDKClientProvider>>.fromOpaque(stateRawPointer)
        let provider: SDKClientProvider = stateTypedPointer.takeUnretainedValue().state

        guard
            let driveClient = provider.get(callbackPointer: callbackPointer, releaseBox: {
                // we don't release the stateTypedPointer by design — there might be some calls coming from the SDK racing with the client deallocation
                // stateTypedPointer.release()
            })
        else { return -1 }

        let httpRequestData = Proton_Sdk_HttpRequest(byteArray: byteArray)
        
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
        httpRequestData: Proton_Sdk_HttpRequest,
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
        httpRequestData: Proton_Sdk_HttpRequest,
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
                let streamReadRequest = Proton_Sdk_StreamReadRequest.with {
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
        let bindingsHandle: Int?
        if let data = response.data, !data.isEmpty {
            let uploadBuffer = BoxedRawBuffer(bufferSize: data.count, logger: client.logger)
            uploadBuffer.copyBytes(from: data)
            let bytesOrStream = BoxedStreamingData(uploadBuffer: uploadBuffer, logger: client.logger)
            bindingsHandle = CallbackHandleRegistry.shared.register(bytesOrStream, scope: .ownerManaged, owner: provider)
        } else {
            bindingsHandle = nil
        }
        let httpResponse = Proton_Sdk_HttpResponse.with {
            $0.headers = response.headers.map { header in
                Proton_Sdk_HttpHeader.with {
                    $0.name = header.0
                    $0.values = header.1
                }
            }
            if let bindingsHandle {
                $0.bindingsContentHandle = Int64(bindingsHandle)
            }
            $0.statusCode = Int32(response.statusCode)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: httpResponse)
    }

    /// the storage upload calls are using stream to upload request body, but cache the whole response in memory
    fileprivate static func uploadToStorage(
        client: ProtonSDKClient,
        httpRequestData: Proton_Sdk_HttpRequest,
        callbackPointer: Int,
        provider: SDKClientProvider
    ) async throws {
        let headers: [(String, [String])] = httpRequestData.headers.map { header in
            (header.name, header.values)
        }

        guard httpRequestData.hasSdkContentHandle else {
            SDKResponseHandler.sendInteropErrorToSDK(
                message: "Proton_Sdk_HttpRequest.sdk_content_handle is missing",
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

        let bindingsHandle: Int?
        if let data = response.data, !data.isEmpty {
            let uploadBuffer = BoxedRawBuffer(bufferSize: data.count, logger: client.logger)
            uploadBuffer.copyBytes(from: data)
            let bytesOrStream = BoxedStreamingData(uploadBuffer: uploadBuffer, logger: client.logger)
            bindingsHandle = CallbackHandleRegistry.shared.register(bytesOrStream, scope: .ownerManaged, owner: provider)
        } else {
            bindingsHandle = nil
        }
        let httpResponse = Proton_Sdk_HttpResponse.with {
            $0.headers = response.headers.map { header in
                Proton_Sdk_HttpHeader.with {
                    $0.name = header.0
                    $0.values = header.1
                }
            }
            if let bindingsHandle {
                $0.bindingsContentHandle = Int64(bindingsHandle)
            }
            $0.statusCode = Int32(response.statusCode)
        }
        SDKResponseHandler.send(callbackPointer: callbackPointer, message: httpResponse)
    }

    /// the download upload calls are caching the whole request body in-memory, but stream the response data
    fileprivate static func downloadFromStorage(
        client: ProtonSDKClient,
        httpRequestData: Proton_Sdk_HttpRequest,
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
                let streamReadRequest = Proton_Sdk_StreamReadRequest.with {
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
        
        let bytesOrStream = BoxedStreamingData(downloadStream: response.stream, logger: client.logger)
        let bindingsHandle = CallbackHandleRegistry.shared.register(bytesOrStream, scope: .ownerManaged, owner: provider)
        let httpResponse = Proton_Sdk_HttpResponse.with {
            $0.headers = response.headers.map { header in
                Proton_Sdk_HttpHeader.with {
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
