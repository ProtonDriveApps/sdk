import Foundation
import SwiftProtobuf

public struct HttpClientResponse {
    let data: Data?
    let headers: [(String, [String])]
    let statusCode: Int

    public init(data: Data?, headers: [(String, [String])], statusCode: Int) {
        self.data = data
        self.headers = headers
        self.statusCode = statusCode
    }
}

/// Protocol to be implemented by object making http requests.
public protocol HttpClientProtocol: AnyObject, Sendable {
    func request(method: String, url: String, content: Data, headers: [(String, [String])]) async -> Result<HttpClientResponse, NSError>
}

let cCompatibleHttpRequest: CCallbackWithCallbackPointer = { statePointer, byteArray, callbackPointer in
    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        return
    }
    let stateTypedPointer = Unmanaged<BoxedContinuationWithState<Int, WeakReference<ProtonDriveClient>>>.fromOpaque(stateRawPointer)
    let weakDriveClient: WeakReference<ProtonDriveClient> = stateTypedPointer.takeUnretainedValue().state
    
    let driveClient = ProtonDriveClient.unbox(callbackPointer: callbackPointer, releaseBox: { stateTypedPointer.release() }, weakDriveClient: weakDriveClient)
    guard let driveClient else { return }

    Task { [driveClient] in
        let httpRequestData = Proton_Sdk_HttpRequest(byteArray: byteArray)
        let headers: [(String, [String])] = httpRequestData.headers.map { header in
            (header.name, header.values)
        }

        let result = await driveClient.httpClient.request(
            method: httpRequestData.method,
            url: httpRequestData.url,
            content: httpRequestData.content,
            headers: headers
        )

        switch result {
        case .success(let response):
            let httpResponse = Proton_Sdk_HttpResponse.with {
                $0.headers = response.headers.map { header in
                    Proton_Sdk_HttpHeader.with {
                        $0.name = header.0
                        $0.values = header.1
                   }
                }
                if let data = response.data {
                    $0.content = data
                }
                $0.statusCode = Int32(response.statusCode)
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: httpResponse)
        case .failure(let error):
            //TODO below we're just returning some rubbish
            let error = Proton_Sdk_Error.with {
                $0.type = "sdk error"
                $0.domain = Proton_Sdk_ErrorDomain.api
                $0.context = error.localizedDescription
            }
            SDKResponseHandler.send(callbackPointer: callbackPointer, message: error)
        }
    }
}
