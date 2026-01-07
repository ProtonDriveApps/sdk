import Foundation

final class SDKClientProvider {
    private weak var client: (any ProtonSDKClient)?

    init(client: any ProtonSDKClient) {
        self.client = client
    }

    func get(callbackPointer: Int, releaseBox: () -> Void) -> (any ProtonSDKClient)? {
        guard let client else {
            releaseBox()
            let message = "callback called after the proton client object was deallocated"
            SDKResponseHandler.sendInteropErrorToSDK(
                message: message,
                callbackPointer: callbackPointer,
                assert: false
            )
            return nil
        }
        return client
    }

    func get() -> (any ProtonSDKClient)? {
        client
    }
}
