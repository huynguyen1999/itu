import Foundation
import XCTest
@testable import iTu

final class APIClientTests: XCTestCase {
    func testAuthSessionDecodesRefreshToken() throws {
        let data = Data(
            """
            {
              "user": {
                "id": "user-1",
                "email": "user@example.com",
                "username": null,
                "displayName": "Test User",
                "avatarUrl": null,
                "roles": [],
                "permissions": []
              },
              "accessToken": "access-token",
              "refreshToken": "refresh-token"
            }
            """.utf8
        )

        let session = try JSONDecoder().decode(AuthSession.self, from: data)

        XCTAssertEqual(session.refreshToken, "refresh-token")
    }

    func testFetchTasksReadsAllCursorPages() async throws {
        let firstTask = ProductivityTask.optimistic(
            id: "01JTESTTASK000000000000001",
            title: "First server task"
        )
        let secondTask = ProductivityTask.optimistic(
            id: "01JTESTTASK000000000000002",
            title: "Second server task"
        )
        let encoder = JSONEncoder()
        let firstPage = try pageData(
            tasks: [firstTask],
            nextCursor: "cursor-2",
            encoder: encoder
        )
        let secondPage = try pageData(
            tasks: [secondTask],
            nextCursor: nil,
            encoder: encoder
        )

        StubURLProtocol.responses = [
            "/productivity/tasks?limit=100": firstPage,
            "/productivity/tasks?limit=100&cursor=cursor-2": secondPage,
        ]
        defer { StubURLProtocol.responses = [:] }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        let tasks = try await client.fetchTasks()

        XCTAssertEqual(tasks.map(\.title), ["First server task", "Second server task"])
    }

    func testTrashRestoreAndPermanentRoutesUseStablePaths() async throws {
        StubURLProtocol.responses = [
            "/trash/journal-entries/entry%2F1/restore": Data("{}".utf8),
            "/trash/journal-entries/entry%2F1": Data("{}".utf8),
            "/trash/budget-transactions/transaction-1/restore": Data("{}".utf8),
            "/trash/budget-transactions/transaction-1": Data("{}".utf8),
            "/trash/gym-workouts/workout-1/restore": Data("{}".utf8),
            "/trash/gym-workouts/workout-1": Data("{}".utf8),
            "/trash/gym-exercises/exercise-1/restore": Data("{}".utf8),
            "/trash/gym-exercises/exercise-1": Data("{}".utf8),
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        try await client.restoreTrashJournalEntry(id: "entry/1")
        try await client.permanentlyDeleteTrashJournalEntry(id: "entry/1")
        try await client.restoreTrashBudgetTransaction(id: "transaction-1")
        try await client.permanentlyDeleteTrashBudgetTransaction(id: "transaction-1")
        try await client.restoreTrashGymWorkout(id: "workout-1")
        try await client.permanentlyDeleteTrashGymWorkout(id: "workout-1")
        try await client.restoreTrashGymExercise(id: "exercise-1")
        try await client.permanentlyDeleteTrashGymExercise(id: "exercise-1")

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), [
            "/trash/journal-entries/entry%2F1/restore", "/trash/journal-entries/entry%2F1",
            "/trash/budget-transactions/transaction-1/restore", "/trash/budget-transactions/transaction-1",
            "/trash/gym-workouts/workout-1/restore", "/trash/gym-workouts/workout-1",
            "/trash/gym-exercises/exercise-1/restore", "/trash/gym-exercises/exercise-1",
        ])
        XCTAssertEqual(StubURLProtocol.requests.map(\.method), ["POST", "DELETE", "POST", "DELETE", "POST", "DELETE", "POST", "DELETE"])
    }

    func testDeleteWebsiteUsageUsesRangeAndAllEndpoints() async throws {
        let empty = Data("{}".utf8)
        StubURLProtocol.responses = [
            "/usage/websites/summaries?from=2026-08-01&to=2026-08-09": empty,
            "/usage/websites/summaries": empty,
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        try await client.deleteWebsiteUsage(from: "2026-08-01", to: "2026-08-09")
        try await client.deleteWebsiteUsage()

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), [
            "/usage/websites/summaries?from=2026-08-01&to=2026-08-09",
            "/usage/websites/summaries",
        ])
        XCTAssertEqual(StubURLProtocol.requests.map(\.method), ["DELETE", "DELETE"])
    }

    func testFetchWebsiteUsageParsesServerResponse() async throws {
        let json = Data(
            """
            {
              "totalActiveSeconds": 120,
              "hostnames": [
                { "hostname": "github.com", "activeSeconds": 120 }
              ],
              "topHostnames": [
                { "hostname": "github.com", "activeSeconds": 120 }
              ],
              "daily": [
                { "localDate": "2026-08-09", "activeSeconds": 120 }
              ],
              "browsers": [
                { "browserBundleId": "com.google.Chrome", "browserDisplayName": "Google Chrome", "activeSeconds": 120 }
              ]
            }
            """.utf8
        )
        StubURLProtocol.responses = [
            "/usage/websites/summaries?from=2026-08-01&to=2026-08-09": json,
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        let stats = try await client.fetchWebsiteUsage(from: "2026-08-01", to: "2026-08-09")

        XCTAssertEqual(stats.totalActiveSeconds, 120)
        XCTAssertEqual(stats.hostnames.first?.hostname, "github.com")
        XCTAssertEqual(stats.hostnames.first?.activeSeconds, 120)
    }

    func testFetchWebsiteUsageStatisticsParsesSessionDrilldownContract() async throws {
        let json = Data(
            """
            {
              "from": "2026-08-01",
              "to": "2026-08-09",
              "totalActiveSeconds": 90,
              "hostnames": [{ "hostname": "example.com", "activeSeconds": 90 }],
              "topHostnames": [{ "hostname": "example.com", "activeSeconds": 90 }],
              "urlDetails": [{ "url": "https://example.com/a", "hostname": "example.com", "activeSeconds": 90, "latestTitle": "Example", "isPrivate": true }],
              "daily": [{ "localDate": "2026-08-09", "activeSeconds": 90 }],
              "sessions": [{ "id": "session-1", "installationId": "install-1", "browserBundleId": "com.google.Chrome", "browserDisplayName": "Chrome", "startedAt": "2026-08-09T10:00:00.000Z", "endedAt": "2026-08-09T10:01:30.000Z", "activeSeconds": 90, "hostname": "example.com", "url": "https://example.com/a", "pageTitle": "Example", "isPrivate": true, "timezone": "UTC", "createdAt": "2026-08-09T10:01:30.000Z" }]
            }
            """.utf8
        )
        StubURLProtocol.responses = [
            "/usage/websites/statistics?from=2026-08-01&to=2026-08-09": json,
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        let stats = try await client.fetchWebsiteUsageStatistics(from: "2026-08-01", to: "2026-08-09")

        XCTAssertEqual(stats.from, "2026-08-01")
        XCTAssertEqual(stats.urlDetails.first?.latestTitle, "Example")
        XCTAssertTrue(stats.urlDetails.first?.isPrivate == true)
        XCTAssertEqual(stats.sessions.first?.startedAt, "2026-08-09T10:00:00.000Z")
        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/usage/websites/statistics?from=2026-08-01&to=2026-08-09"])
    }

    func testUploadWebsiteUsageUsesBatchEndpoint() async throws {
        StubURLProtocol.responses = ["/usage/websites/summaries/batch": Data("{}".utf8)]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))
        let summary = WebsiteUsageSummary(
            localDate: "2026-08-09",
            browserBundleId: BrowserActivityState.edgeBundleID,
            browserDisplayName: "Microsoft Edge",
            hostname: "example.com",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 30
        )

        try await client.uploadWebsiteUsageSummaries([summary], deviceId: "device-1")

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/usage/websites/summaries/batch"])
        XCTAssertEqual(StubURLProtocol.requests.map(\.method), ["POST"])
    }

    func testUploadUsageIncludesEngagedSeconds() async throws {
        StubURLProtocol.responses = ["/usage/summaries/batch": Data("{}".utf8)]
        StubURLProtocol.requests = []
        StubURLProtocol.requestBodies = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
            StubURLProtocol.requestBodies = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))
        let summary = UsageSummary(
            localDate: "2026-08-09", bundleId: "app.editor", displayName: "Editor",
            timezone: "Asia/Ho_Chi_Minh", activeSeconds: 30, engagedSeconds: 20
        )

        try await client.uploadUsageSummaries([summary], deviceId: "device-1")

        let body = try XCTUnwrap(StubURLProtocol.requestBodies.first)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let summaries = try XCTUnwrap(json["summaries"] as? [[String: Any]])
        XCTAssertEqual((summaries.first?["engagedSeconds"] as? NSNumber)?.intValue, 20)
    }

    func testFetchUsageAppIdentitiesUsesMetadataEndpoint() async throws {
        StubURLProtocol.responses = [
            "/usage/apps": Data("[{\"bundleId\":\"com.example.Editor\",\"displayName\":\"Editor\",\"iconHash\":\"abc\",\"iconUrl\":\"/media/editor.png\"}]".utf8)
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        let identities = try await client.fetchUsageAppIdentities()

        XCTAssertEqual(identities, [UsageAppIdentity(bundleId: "com.example.Editor", displayName: "Editor", iconHash: "abc", iconUrl: "/media/editor.png")])
        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/usage/apps"])
    }

    func testUploadUsageAppIconEncodesDisplayNameBeforeImage() async throws {
        StubURLProtocol.responses = [
            "/usage/apps/com.example.Editor/icon": Data("{\"bundleId\":\"com.example.Editor\",\"displayName\":\"Editor\",\"iconHash\":\"abc\",\"iconUrl\":\"/media/editor.png\"}".utf8)
        ]
        StubURLProtocol.requests = []
        StubURLProtocol.requestBodies = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
            StubURLProtocol.requestBodies = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))
        let icon = Data([0, 1, 2, 3])

        _ = try await client.uploadUsageAppIcon(bundleId: "com.example.Editor", displayName: "Editor", fileData: icon)

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/usage/apps/com.example.Editor/icon"])
        XCTAssertEqual(StubURLProtocol.requests.map(\.method), ["PUT"])
        let body = try XCTUnwrap(StubURLProtocol.requestBodies.first)
        let text = try XCTUnwrap(String(data: body, encoding: .utf8))
        XCTAssertLessThan(try XCTUnwrap(text.range(of: "name=\"displayName\"")?.lowerBound), try XCTUnwrap(text.range(of: "name=\"image\"")?.lowerBound))
        XCTAssertTrue(text.contains("Content-Type: image/png"))
        XCTAssertNotNil(body.range(of: icon))
    }

    func testUploadUsageAppIconEscapesSlashInBundleIDPathSegment() async throws {
        StubURLProtocol.responses = [
            "/usage/apps/com.foo%2Fbar/icon": Data("{\"bundleId\":\"com.foo/bar\",\"displayName\":\"App\",\"iconHash\":null,\"iconUrl\":null}".utf8)
        ]
        StubURLProtocol.requests = []
        defer {
            StubURLProtocol.responses = [:]
            StubURLProtocol.requests = []
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: configuration))

        _ = try await client.uploadUsageAppIcon(bundleId: "com.foo/bar", displayName: "App", fileData: Data([1]))

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/usage/apps/com.foo%2Fbar/icon"])
    }

    private func pageData(
        tasks: [ProductivityTask],
        nextCursor: String?,
        encoder: JSONEncoder
    ) throws -> Data {
        let encodedTasks = try tasks.map { task in
            try XCTUnwrap(JSONSerialization.jsonObject(with: encoder.encode(task)) as? [String: Any])
        }
        return try JSONSerialization.data(withJSONObject: [
            "data": encodedTasks,
            "meta": [
                "hasNextPage": nextCursor != nil,
                "nextCursor": nextCursor.map { $0 as Any } ?? NSNull(),
            ],
        ])
    }
}

private final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var responses: [String: Data] = [:]
    nonisolated(unsafe) static var requests: [(path: String, method: String)] = []
    nonisolated(unsafe) static var requestBodies: [Data] = []

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let encodedPath = request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.percentEncodedPath } ?? request.url?.path ?? ""
        let key = encodedPath + (request.url?.query.map { "?\($0)" } ?? "")
        Self.requests.append((key, request.httpMethod ?? "GET"))
        if let body = request.httpBody {
            Self.requestBodies.append(body)
        } else if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var body = Data()
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let count = stream.read(buffer, maxLength: 4096)
                if count <= 0 { break }
                body.append(buffer, count: count)
            }
            Self.requestBodies.append(body)
        }
        guard let data = Self.responses[key] else {
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 404,
                httpVersion: nil,
                headerFields: nil
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("{}".utf8))
            client?.urlProtocolDidFinishLoading(self)
            return
        }

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
