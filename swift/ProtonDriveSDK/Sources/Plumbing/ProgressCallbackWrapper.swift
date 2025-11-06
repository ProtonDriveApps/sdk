// Copyright (c) 2025 Proton AG
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
import CProtonDriveSDK

final class ProgressCallbackWrapper {
    let callback: ProgressCallback

    init(callback: @escaping ProgressCallback) {
        self.callback = callback
    }
}

let cProgressCallback: CCallback = { statePointer, byteArray in
    typealias BoxType = BoxedContinuationWithState<Int, WeakReference<ProgressCallbackWrapper>>
    let progressUpdate = Proton_Drive_Sdk_ProgressUpdate(byteArray: byteArray)
    let progress = FileOperationProgress(
        bytesCompleted: progressUpdate.bytesCompleted,
        bytesTotal: progressUpdate.bytesInTotal
    )

    guard let stateRawPointer = UnsafeRawPointer(bitPattern: statePointer) else { return }
    let stateTypedPointer = Unmanaged<BoxType>.fromOpaque(stateRawPointer)
    let weakWrapper: WeakReference<ProgressCallbackWrapper> = stateTypedPointer.takeUnretainedValue().state
    weakWrapper.value?.callback(progress)

    // TODO: also release pointer when task is cancelled
    if progress.isCompleted {
        stateTypedPointer.release()
    }
}
