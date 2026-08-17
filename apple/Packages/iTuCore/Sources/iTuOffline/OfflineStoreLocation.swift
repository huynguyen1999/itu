import Foundation
public struct OfflineStoreLocation: Equatable, Sendable {
    public let rootURL: URL

    public init(rootURL: URL) {
        self.rootURL = rootURL
    }
}
