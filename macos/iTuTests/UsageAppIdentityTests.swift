import AppKit
import XCTest
@testable import iTu

final class UsageAppIdentityTests: XCTestCase {
    @MainActor
    func testRasterizationIs64PixelsAndDeterministic() throws {
        let image = NSImage(size: NSSize(width: 16, height: 16))
        image.lockFocus()
        NSColor(calibratedRed: 0.2, green: 0.4, blue: 0.8, alpha: 1).setFill()
        NSRect(x: 0, y: 0, width: 16, height: 16).fill()
        image.unlockFocus()

        let first = try XCTUnwrap(UsageAppIconRenderer.pngData(for: image))
        let second = try XCTUnwrap(UsageAppIconRenderer.pngData(for: image))
        let rep = try XCTUnwrap(NSBitmapImageRep(data: first))

        XCTAssertEqual(rep.pixelsWide, 64)
        XCTAssertEqual(rep.pixelsHigh, 64)
        XCTAssertEqual(first, second)
        XCTAssertEqual(UsageAppIconRenderer.sha256Hex(first), UsageAppIconRenderer.sha256Hex(second))
    }

    func testCacheDecisionSkipsKnownServerIconAndUploadsMissingOrChangedIcon() {
        let known = UsageAppIdentity(bundleId: "app", displayName: "App", iconHash: "same", iconUrl: "/media/app.png")
        let noHash = UsageAppIdentity(bundleId: "app", displayName: "App", iconHash: nil, iconUrl: "/media/app.png")

        XCTAssertFalse(UsageAppIconUploadDecision.shouldUpload(localHash: "same", server: known, cachedHash: nil))
        XCTAssertFalse(UsageAppIconUploadDecision.shouldUpload(localHash: "same", server: noHash, cachedHash: "same"))
        XCTAssertTrue(UsageAppIconUploadDecision.shouldUpload(localHash: "new", server: known, cachedHash: "same"))
        XCTAssertTrue(UsageAppIconUploadDecision.shouldUpload(localHash: "same", server: nil, cachedHash: "same"))
    }

    @MainActor
    func testMissingBundleIconProducesNoUploadData() {
        XCTAssertNil(UsageAppIconRenderer.pngData(forBundleID: "com.itu.this.bundle.does.not.exist"))
    }
}
