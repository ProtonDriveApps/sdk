import Foundation

public enum ProtonDriveSDKError: String, LocalizedError {
    case noHandle
    
    public var errorDescription: String? { rawValue }
}
