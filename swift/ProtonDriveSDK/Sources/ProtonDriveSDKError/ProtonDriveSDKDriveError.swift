// Copyright (c) 2026 Proton AG
//
// This file is part of Proton Drive.
//
// Proton Drive is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Proton Drive is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Proton Drive. If not, see https://www.gnu.org/licenses/.

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
