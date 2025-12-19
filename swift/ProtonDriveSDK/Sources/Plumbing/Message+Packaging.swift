import SwiftProtobuf
import CProtonDriveSDK

extension Message {
    func serializedIntoRequest() throws -> ByteArray {
        try packIntoRequest().serialisedByteArray()
    }
    
    func serializedIntoResponse() throws -> ByteArray {
        try packIntoResponse().serialisedByteArray()
    }
    
    /// Packs any request into a Proton_Sdk_Request or Proton_Drive_Sdk_Request.
    func packIntoRequest() throws -> Message {
        switch self {

        case let request as Proton_Sdk_CancellationTokenSourceCreateRequest:
            Proton_Sdk_Request.with {
                $0.payload = .cancellationTokenSourceCreate(request)
            }

        case let request as Proton_Sdk_CancellationTokenSourceCancelRequest:
            Proton_Sdk_Request.with {
                $0.payload = .cancellationTokenSourceCancel(request)
            }

        case let request as Proton_Sdk_CancellationTokenSourceFreeRequest:
            Proton_Sdk_Request.with {
                $0.payload = .cancellationTokenSourceFree(request)
            }

        case let request as Proton_Sdk_StreamReadRequest:
            Proton_Sdk_Request.with {
                $0.payload = .streamRead(request)
            }

        case let request as Proton_Sdk_LoggerProviderCreate:
            Proton_Sdk_Request.with {
                $0.payload = .loggerProviderCreate(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientCreateRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientCreate(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientCreateFromSessionRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientCreateFromSession(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientFreeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientFree(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientGetFileUploaderRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientGetFileUploader(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientGetFileRevisionUploaderRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientGetFileRevisionUploader(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientGetFileDownloaderRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientGetFileDownloader(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientGetAvailableNameRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientGetAvailableName(request)
            }

        case let request as Proton_Drive_Sdk_DriveClientGetThumbnailsRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .driveClientGetThumbnails(request)
            }

        case let request as Proton_Drive_Sdk_UploadFromFileRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadFromFile(request)
            }

        case let request as Proton_Drive_Sdk_FileUploaderFreeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .fileUploaderFree(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerIsPausedRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerIsPaused(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerAwaitCompletionRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerAwaitCompletion(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerPauseRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerPause(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerResumeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerResume(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerDisposeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerDispose(request)
            }

        case let request as Proton_Drive_Sdk_UploadControllerFreeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .uploadControllerFree(request)
            }

        case let request as Proton_Drive_Sdk_DownloadToFileRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadToFile(request)
            }

        case let request as Proton_Drive_Sdk_FileDownloaderFreeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .fileDownloaderFree(request)
            }

        case let request as Proton_Drive_Sdk_DownloadControllerIsPausedRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadControllerIsPaused(request)
            }

        case let request as Proton_Drive_Sdk_DownloadControllerAwaitCompletionRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadControllerAwaitCompletion(request)
            }

        case let request as Proton_Drive_Sdk_DownloadControllerPauseRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadControllerPause(request)
            }

        case let request as Proton_Drive_Sdk_DownloadControllerResumeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadControllerResume(request)
            }

        case let request as Proton_Drive_Sdk_DownloadControllerFreeRequest:
            Proton_Drive_Sdk_Request.with {
                $0.payload = .downloadControllerFree(request)
            }

        default:
            assertionFailure("Unknown request")
            throw ProtonDriveSDKError(interopError: .wrongProto(message: "Unknown request type: \(self)"))
        }
    }
    
    private func packIntoResponse() throws -> Message {
        if let error = self as? Proton_Sdk_Error {
            return Proton_Sdk_Response.with {
                $0.error = error
            }
        }
        switch self {
        case let httpResponse as Proton_Sdk_HttpResponse:
            let value = try Google_Protobuf_Any.init(message: httpResponse)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        case let repeatedBytes as Proton_Sdk_RepeatedBytesValue:
            let value = try Google_Protobuf_Any.init(message: repeatedBytes)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        case let bytesValue as Google_Protobuf_BytesValue:
            let value = try Google_Protobuf_Any.init(message: bytesValue)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        case let address as Proton_Sdk_Address:
            let value = try Google_Protobuf_Any.init(message: address)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        case let error as Proton_Sdk_Error:
            return Proton_Sdk_Response.with {
                $0.error = error
            }
        case let intValue as Google_Protobuf_Int64Value:
            let value = try Google_Protobuf_Any.init(message: intValue)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        case let intValue as Google_Protobuf_Int32Value:
            let value = try Google_Protobuf_Any.init(message: intValue)
            return Proton_Sdk_Response.with {
                $0.value = value
            }
        default:
            assertionFailure("Unknown response type: \(self)")
            throw ProtonDriveSDKError(interopError: .wrongProto(message: "Unknown response type: \(self)"))
        }
    }
    
    private func serialisedByteArray() throws -> ByteArray {
        ByteArray(data: try serializedData())
    }
}
