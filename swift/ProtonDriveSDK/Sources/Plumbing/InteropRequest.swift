protocol InteropRequest {
    associatedtype CallResultType: Sendable
    associatedtype StateType
}

extension InteropRequest {
    typealias BoxedStateType = BoxedCompletionBlock<CallResultType, StateType>
}

extension Proton_Drive_Sdk_DriveClientCreateRequest: InteropRequest {
    typealias CallResultType = ObjectHandle
    typealias StateType = WeakReference<ProtonDriveClient>
}

extension Proton_Sdk_CancellationTokenSourceCreateRequest: InteropRequest {
    typealias CallResultType = ObjectHandle
    typealias StateType = Void
}

extension Proton_Sdk_CancellationTokenSourceCancelRequest: InteropRequest {
    typealias CallResultType = Void
    typealias StateType = Void
}

extension Proton_Sdk_CancellationTokenSourceFreeRequest: InteropRequest {
    typealias CallResultType = Void
    typealias StateType = Void
}
