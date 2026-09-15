import Foundation

/// Holds the SHA-1 digest to hand back to the SDK when it asks for the local file's content hash
/// during duplicate detection.
final class FindDuplicatesState: Sendable {
    let sha1: Data

    init(sha1: Data) {
        self.sha1 = sha1
    }

    deinit {
        CallbackHandleRegistry.shared.removeAll(ownedBy: self)
    }
}

/// C callback matching `void generate_sha1(intptr_t bindings_handle, ByteArray output_buffer)`.
/// Writes the precomputed 20-byte SHA-1 digest into the buffer provided by the SDK.
let cGenerateSha1CallbackForFindDuplicates: CCallback = { stateHandle, byteArray in
    typealias BoxType = BoxedCompletionBlock<[String], WeakReference<FindDuplicatesState>>
    guard let box: BoxType = CallbackHandleRegistry.shared.get(stateHandle) else {
        return
    }
    guard
        let sha1 = box.state.value?.sha1,
        let destBase = byteArray.pointer
    else { return }

    let dest = UnsafeMutableRawPointer(mutating: destBase)
    let outLen = Int(byteArray.length)

    // The contract is a fixed 20-byte SHA-1 buffer. Fail loudly on a mismatch rather than writing a
    // partial digest, which would silently produce a wrong content hash and incorrect duplicate results.
    guard outLen >= sha1.count else {
        assertionFailure("cGenerateSha1CallbackForFindDuplicates: output buffer (\(outLen)) is smaller than the SHA-1 digest (\(sha1.count))")
        return
    }

    sha1.withUnsafeBytes { src in
        if let p = src.baseAddress {
            dest.copyMemory(from: p, byteCount: sha1.count)
        }
    }
}
