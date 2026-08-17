import Foundation
import XCTest
import iTuNetworking
import iTuOffline
@testable import iTuSync

final class AccountHydratorTests: XCTestCase {
    func testHydrationReportsFailedResources() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-hydrator-failures-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "hydrator-failures", baseURL: root)
        _ = try await store.load()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HydrationURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration),
            credentialStore: EmptyCredentialStore()
        )

        let result = try await AccountHydrator(apiClient: client, offlineStore: store).hydrate()

        XCTAssertTrue(result.failedResources.contains("tasks"))
    }

    func testSupersededHydrationStopsBeforeApplyingSnapshot() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("iTu-hydrator-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let store = OfflineStore(accountID: "hydrator-account", baseURL: root)
        _ = try await store.load()
        let before = await store.snapshot()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HydrationURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration),
            credentialStore: EmptyCredentialStore()
        )

        do {
            _ = try await AccountHydrator(
                apiClient: client,
                offlineStore: store,
                isCurrent: { false }
            ).hydrate()
            XCTFail("expected superseded hydration")
        } catch AccountHydrationError.superseded {
            // Expected: the stale generation must not reach OfflineStore.applyHydration.
        }

        let after = await store.snapshot()
        XCTAssertEqual(after, before)
    }
}

private struct EmptyCredentialStore: CredentialStore {
    func load(_: CredentialKey) throws -> String? { nil }
    func save(_: String, for _: CredentialKey) throws {}
    func delete(_: CredentialKey) throws {}
}

private final class HydrationURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
