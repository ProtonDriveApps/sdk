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

public enum PhotoTag: Int, Equatable, Codable, CaseIterable, Sendable {
    case favorites = 0
    case screenshots = 1
    case videos = 2
    case livePhotos = 3
    case motionPhotos = 4
    case selfies = 5
    case portraits = 6
    case bursts = 7
    case panoramas = 8
    case raw = 9
}
