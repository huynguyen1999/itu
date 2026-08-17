import Foundation
import XCTest
import iTuDomain
@testable import iTuNetworking

final class APIClientPhase6Tests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.reset()
        super.tearDown()
    }

    func testBudgetRequestPreservesEscapedQueryAndMethod() async throws {
        StubURLProtocol.responseData = Data("[]".utf8)
        let client = makeClient()

        _ = try await client.getBudgetExpenses(
            period: "2026-08",
            categoryID: "category/one",
            search: "coffee tea"
        )

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(
            request.url?.absoluteString,
            "https://example.test/budget/expenses?period=2026-08&categoryId=category/one&search=coffee%20tea"
        )
    }

    func testUsageBatchEncodingIncludesOptionalFields() async throws {
        StubURLProtocol.responseData = Data("{}".utf8)
        let client = makeClient()
        let summary = UsageSummary(
            localDate: "2026-08-17",
            hour: 9,
            bundleId: "com.example.editor",
            displayName: "Editor",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 120,
            engagedSeconds: 90,
            source: .deviceActivity,
            pickups: 2,
            notifications: 3
        )

        try await client.uploadUsageSummaries([summary], deviceId: "ios-device")

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/usage/summaries/batch")
        let body = try XCTUnwrap(StubURLProtocol.bodyData(for: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["deviceId"] as? String, "ios-device")
        let summaries = try XCTUnwrap(json["summaries"] as? [[String: Any]])
        XCTAssertEqual(summaries.first?["source"] as? String, "DEVICE_ACTIVITY")
        XCTAssertEqual((summaries.first?["engagedSeconds"] as? NSNumber)?.intValue, 90)
        XCTAssertEqual((summaries.first?["pickups"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((summaries.first?["notifications"] as? NSNumber)?.intValue, 3)
    }

    func testStudyAndNotificationPathsDecodePortableWireTypes() async throws {
        StubURLProtocol.responseData = Data("{\"data\":[],\"meta\":{\"hasNextPage\":false,\"nextCursor\":null}}".utf8)
        let client = makeClient()
        let decks = try await client.fetchDecks()
        XCTAssertTrue(decks.isEmpty)

        StubURLProtocol.responseData = Data("{}".utf8)
        try await client.markAllNotificationsRead()

        XCTAssertEqual(StubURLProtocol.requests.map { $0.url?.path }, [
            "/decks",
            "/productivity/notifications/read-all"
        ])
        XCTAssertEqual(StubURLProtocol.requests.map(\.httpMethod), ["GET", "POST"])
    }

    private func makeClient() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration),
            credentialStore: EmptyCredentialStore()
        )
    }
}

private struct EmptyCredentialStore: CredentialStore {
    func load(_: CredentialKey) throws -> String? { nil }
    func save(_: String, for _: CredentialKey) throws {}
    func delete(_: CredentialKey) throws {}
}

private final class StubURLProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var storedRequests: [URLRequest] = []
    nonisolated(unsafe) private static var storedResponseData = Data("{}".utf8)

    static var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return storedRequests
    }

    static var responseData: Data {
        get {
            lock.lock()
            defer { lock.unlock() }
            return storedResponseData
        }
        set {
            lock.lock()
            storedResponseData = newValue
            lock.unlock()
        }
    }

    static func reset() {
        lock.lock()
        storedRequests = []
        storedResponseData = Data("{}".utf8)
        lock.unlock()
    }

    static func bodyData(for request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.storedRequests.append(request)
        let data = Self.storedResponseData
        Self.lock.unlock()

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
