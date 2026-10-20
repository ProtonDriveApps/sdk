import Foundation

final class SearchHitEnumerationCallbackWrapper: Sendable {
    let callback: SearchHitCallback

    init(callback: @escaping SearchHitCallback) {
        self.callback = callback
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

let cSearchHitEnumerationCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedCompletionBlock<UInt, WeakReference<SearchHitEnumerationCallbackWrapper>>

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else {
        assertionFailure("cSearchHitEnumerationCallback.statePointer is nil")
        return
    }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper = stateTypedPointer.takeUnretainedValue().state

    let protoHit = Proton_Drive_Sdk_SearchHit(byteArray: byteArray)
    do {
        let hit = try SearchHit(sdkHit: protoHit)
        weakWrapper.value?.callback(.success(hit))
    } catch {
        weakWrapper.value?.callback(.failure(error))
    }
}

extension SearchHit {
    init(sdkHit: Proton_Drive_Sdk_SearchHit) throws {
        guard let nodeUid = SDKNodeUid(sdkCompatibleIdentifier: sdkHit.identifier) else {
            throw ProtonDriveSDKError(interopError: .incorrectIDFormat(id: sdkHit.identifier))
        }
        self.nodeUid = nodeUid
        self.score = sdkHit.score
    }
}
