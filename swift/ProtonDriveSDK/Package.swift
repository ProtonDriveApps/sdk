// swift-tools-version: 6.0
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription
import Foundation

let package = Package(
    name: "ProtonDriveSDK",
    platforms: [
        .macOS(.v13),
        .iOS(.v16),
        .tvOS(.v15),
        .watchOS(.v8)
    ],
    products: [
        .library(
            name: "ProtonDriveSDK",
            targets: ["ProtonDriveSDK"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-protobuf.git", from: "1.33.3"),
        .package(url: "https://github.com/SimplyDanny/SwiftLintPlugins", from: "0.1.0"),
        .package(url: "https://github.com/ProtonMail/protoncore_ios.git", exact: "34.2.2"),
    ],
    targets: [
        .binaryTarget(
            name: "CProtonDriveSDK",
            path: "./Libraries/ProtonDriveSDK.xcframework"
        ),
        .target(
            name: "ProtonDriveSDK",
            dependencies: [
                "CProtonDriveSDK",
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
                .product(name: "GoLibsCryptoPatchedGo", package: "protoncore_ios"),
                .product(name: "ProtonCoreDataModel", package: "protoncore_ios"),
            ],
            path: "Sources",
            swiftSettings: [
                .unsafeFlags(["-strict-concurrency=complete"]),
            ],
            linkerSettings: [
                // GSS is required by dotNET runtime, not directly used by the Drive app
                .linkedFramework("GSS"),
                .linkedLibrary("sqlite3"),
                .linkedLibrary("icucore"),

                .unsafeFlags([
                    // the bootstrapper contains the code to start the dotNET runtime – it asks the system API
                    // to spawn a new thread for garbage collector, allocate the memory to be managed by dotNET etc.
                    "-llibbootstrapperdll.osx-arm64.o",
                    "-llibbootstrapperdll.osx-x64.o",
                ], .when(platforms: [.macOS])),
            ],
        ),
    ]
)
