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

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let key = (request.url?.path ?? "") + (request.url?.query.map { "?\($0)" } ?? "")
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
