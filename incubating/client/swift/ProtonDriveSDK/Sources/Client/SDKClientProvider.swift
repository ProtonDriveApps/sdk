import Foundation

// The client owns teardown: it removes registrations keyed by this provider in its deinit.
// The registry may retain the provider, so cleanup must not depend on provider deallocation.
final class SDKClientProvider: @unchecked Sendable {
    static func resolve(_ handle: Int) -> SDKClientProvider? {
        let box: BoxedCompletionBlock<Int, SDKClientProvider>? = CallbackHandleRegistry.shared.get(handle)
        return box?.state
    }

    private weak var client: (any ProtonSDKClient)?

    init(client: any ProtonSDKClient) {
        self.client = client
    }

    func get(callbackPointer: Int) -> (any ProtonSDKClient)? {
        guard let client else {
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
