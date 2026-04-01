import Foundation

public final class ProtonDriveSDKDriveError: Error, LocalizedError {
    public let message: String?
    public let innerError: ProtonDriveSDKDriveError?
    
    public init(message: String? = nil, innerError: ProtonDriveSDKDriveError? = nil) {
        self.message = message
        self.innerError = innerError
    }

    init(error: Proton_Drive_Sdk_DriveError) {
        self.message = error.hasMessage ? error.message : nil
        self.innerError = error.hasInnerError ? ProtonDriveSDKDriveError(error: error.innerError) : nil
    }

    public var errorDescription: String? {
        var desc: [String] = [message, innerError?.localizedDescription].compactMap { $0 }
        return desc.joined(separator: ", ")
    }
}
