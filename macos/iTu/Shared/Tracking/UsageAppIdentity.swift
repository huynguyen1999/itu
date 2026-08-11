import AppKit
import CryptoKit
import Foundation

enum UsageAppIconUploadDecision {
    static func shouldUpload(localHash: String, server: UsageAppIdentity?, cachedHash: String?) -> Bool {
        guard let server else { return true }
        if server.iconHash == localHash { return false }
        if server.iconHash == nil, server.iconUrl != nil, cachedHash == localHash { return false }
        return true
    }
}

@MainActor
enum UsageAppIconRenderer {
    static func pngData(forBundleID bundleID: String, workspace: NSWorkspace = .shared) -> Data? {
        guard let applicationURL = workspace.urlForApplication(withBundleIdentifier: bundleID) else { return nil }
        return pngData(for: workspace.icon(forFile: applicationURL.path))
    }

    static func pngData(for image: NSImage) -> Data? {
        let size = 64
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: size,
            pixelsHigh: size,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bitmapFormat: [],
            bytesPerRow: 0,
            bitsPerPixel: 0
        ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return nil }

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: size, height: size).fill()
        image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .sourceOver, fraction: 1)
        context.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        return bitmap.representation(using: .png, properties: [:])
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
