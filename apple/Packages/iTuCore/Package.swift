// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "iTuCore",
    platforms: [.iOS(.v15), .macOS(.v15)],
    products: [
        .library(name: "iTuDomain", targets: ["iTuDomain"]),
        .library(name: "iTuOffline", targets: ["iTuOffline"]),
        .library(name: "iTuSync", targets: ["iTuSync"]),
        .library(name: "iTuNetworking", targets: ["iTuNetworking"]),
        .library(name: "iTuDesignCore", targets: ["iTuDesignCore"])
    ],
    targets: [
        .target(name: "iTuDomain"),
        .target(name: "iTuOffline", dependencies: ["iTuDomain"]),
        .target(name: "iTuSync", dependencies: ["iTuOffline", "iTuNetworking"]),
        .target(name: "iTuNetworking", dependencies: ["iTuDomain", "iTuOffline"]),
        .target(name: "iTuDesignCore"),
        .testTarget(name: "iTuDomainTests", dependencies: ["iTuDomain"]),
        .testTarget(name: "iTuOfflineTests", dependencies: ["iTuOffline", "iTuDomain"]),
        .testTarget(name: "iTuSyncTests", dependencies: ["iTuSync", "iTuOffline"]),
        .testTarget(name: "iTuNetworkingTests", dependencies: ["iTuNetworking", "iTuDomain"]),
        .testTarget(name: "iTuDesignCoreTests", dependencies: ["iTuDesignCore"])
    ]
)
