import Foundation

/// Distinguishes registry-issued identifiers from raw memory addresses at the API level.
typealias RegistryHandle = Int

protocol RegistryCancellable: AnyObject {
    func cancel()
}

/// Adopted by types whose extra lifetime reference is managed by `CallbackHandleRegistry`.
/// The response callback checks this after `takeRetainedValue()` to release the registry entry.
protocol RegistryTracking: AnyObject {
    var registryHandleId: RegistryHandle? { get set }
}

enum CallbackScope: Equatable {
    /// Callback that finishes within a discrete operation (e.g. a single request/response).
    /// The registry entry is removed automatically when the response callback fires.
    case operation

    /// Callback whose lifetime is tied to a specific owner object.
    /// The registry entry survives the response callback and is cleaned up when the owner
    /// calls `removeAll(ownedBy:)` in its `deinit`.
    case ownerManaged

    /// Callback that intentionally outlives every owner (e.g. client-creation state that must
    /// stay alive for secondary C# callbacks during teardown). Not cleaned up by any owner.
    case indefinite
}

/// Thread-safe registry that manages object lifetimes across the Swift/C# interop boundary.
///
/// Instead of passing raw `Unmanaged` pointers to C# (which can become dangling when Swift frees
/// the object), callers register objects here and pass the integer ID. Both sides of the boundary
/// interact through the ID — looking up, removing, or ignoring missing entries safely.
///
/// Typical patterns:
/// - **Cancellable tasks:** `register` on creation, `remove` on natural completion,
///   `remove` + `cancel()` on cancellation. Only one side gets the object.
/// - **Long-lived state:** `register` on setup, `get` on each callback, `remove` on teardown.
final class CallbackHandleRegistry: @unchecked Sendable {
    static let shared = CallbackHandleRegistry()

    private let lock = NSLock()
    private var nextId: RegistryHandle = 1
    private var entries: [RegistryHandle: Entry] = [:]

    private struct Entry {
        let object: AnyObject
        let scope: CallbackScope
        weak var owner: AnyObject?
    }

    func register(_ object: AnyObject, scope: CallbackScope = .operation, owner: AnyObject? = nil) -> RegistryHandle {
        switch scope {
        case .ownerManaged where owner == nil:
            assertionFailure("ownerManaged scope requires a non-nil owner")
        case .operation where owner != nil,
             .indefinite where owner != nil:
            assertionFailure("\(scope) scope should not have an owner")
        default:
            break
        }

        lock.lock()
        let id = nextId
        nextId += 1
        entries[id] = Entry(object: object, scope: scope, owner: owner)
        lock.unlock()
        return id
    }

    /// Removes and returns the entry. Returns nil if already removed.
    @discardableResult
    func remove(_ id: RegistryHandle) -> AnyObject? {
        lock.lock()
        let object = entries.removeValue(forKey: id)?.object
        lock.unlock()
        return object
    }

    /// Looks up without removing. Returns nil if the entry doesn't exist or isn't the expected type.
    func get<T: AnyObject>(_ id: RegistryHandle, as type: T.Type = T.self) -> T? {
        lock.lock()
        let object = entries[id]?.object as? T
        lock.unlock()
        return object
    }

    /// Returns whether an entry with the given ID exists.
    func contains(_ id: RegistryHandle) -> Bool {
        lock.lock()
        let result = entries[id] != nil
        lock.unlock()
        return result
    }

    /// Returns the scope of the entry with the given ID, or nil if not found.
    func scope(for id: RegistryHandle) -> CallbackScope? {
        lock.lock()
        let scope = entries[id]?.scope
        lock.unlock()
        return scope
    }

    /// Removes the entry and cancels it if it conforms to `RegistryCancellable`.
    func cancel(_ id: RegistryHandle) {
        (remove(id) as? RegistryCancellable)?.cancel()
    }

    /// Removes all entries owned by the given owner without cancelling them.
    func removeAll(ownedBy owner: AnyObject) {
        lock.lock()
        let keysToRemove = entries.filter { $0.value.owner === owner }.map { $0.key }
        for key in keysToRemove {
            entries.removeValue(forKey: key)
        }
        lock.unlock()
    }

}
