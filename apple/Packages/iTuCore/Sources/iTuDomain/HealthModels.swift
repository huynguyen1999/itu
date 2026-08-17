import Foundation

/// The system that produced a normalized health record.
public enum HealthSource: String, Codable, CaseIterable, Sendable {
    case healthKit = "HEALTH_KIT"

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        switch value {
        case Self.healthKit.rawValue, "HEALTHKIT":
            self = .healthKit
        default:
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Unsupported health source: \(value)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// An absolute, account-syncable daily health summary.
///
/// HealthKit samples are intentionally not represented here. The identity is
/// the source/device/local-day tuple so repeated imports replace the same
/// summary instead of accumulating duplicate values.
public struct HealthDailySummaryModel: Codable, Equatable, Sendable, Identifiable {
    public let source: HealthSource
    public let deviceId: String
    public let localDate: String
    public var steps: Int
    public var walkingRunningDistanceMeters: Double
    public var activeEnergyKcal: Double
    public var exerciseMinutes: Int
    public var standHours: Double?
    public var sleepMinutes: Int
    public var sleepStartAt: String?
    public var sleepEndAt: String?
    public var restingHeartRateBpm: Double?
    public var hrvMilliseconds: Double?
    public var workoutCount: Int
    public var workoutMinutes: Int
    public var workoutEnergyKcal: Double

    public var id: String { Self.identity(source: source, deviceId: deviceId, localDate: localDate) }

    public init(
        source: HealthSource = .healthKit,
        deviceId: String,
        localDate: String,
        steps: Int = 0,
        walkingRunningDistanceMeters: Double = 0,
        activeEnergyKcal: Double = 0,
        exerciseMinutes: Int = 0,
        standHours: Double? = nil,
        sleepMinutes: Int = 0,
        sleepStartAt: String? = nil,
        sleepEndAt: String? = nil,
        restingHeartRateBpm: Double? = nil,
        hrvMilliseconds: Double? = nil,
        workoutCount: Int = 0,
        workoutMinutes: Int = 0,
        workoutEnergyKcal: Double = 0
    ) {
        self.source = source
        self.deviceId = deviceId
        self.localDate = localDate
        self.steps = steps
        self.walkingRunningDistanceMeters = walkingRunningDistanceMeters
        self.activeEnergyKcal = activeEnergyKcal
        self.exerciseMinutes = exerciseMinutes
        self.standHours = standHours
        self.sleepMinutes = sleepMinutes
        self.sleepStartAt = sleepStartAt
        self.sleepEndAt = sleepEndAt
        self.restingHeartRateBpm = restingHeartRateBpm
        self.hrvMilliseconds = hrvMilliseconds
        self.workoutCount = workoutCount
        self.workoutMinutes = workoutMinutes
        self.workoutEnergyKcal = workoutEnergyKcal
    }

    public static func identity(source: HealthSource, deviceId: String, localDate: String) -> String {
        "\(source.rawValue)|\(deviceId)|\(localDate)"
    }

    private enum CodingKeys: String, CodingKey {
        case source, deviceId, localDate, steps, walkingRunningDistanceMeters, activeEnergyKcal
        case exerciseMinutes, standHours, sleepMinutes, sleepStartAt, sleepEndAt
        case restingHeartRateBpm, hrvMilliseconds, workoutCount, workoutMinutes, workoutEnergyKcal
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        source = try values.decodeIfPresent(HealthSource.self, forKey: .source) ?? .healthKit
        deviceId = try values.decodeIfPresent(String.self, forKey: .deviceId) ?? ""
        localDate = try values.decodeIfPresent(String.self, forKey: .localDate) ?? ""
        steps = try values.decodeIfPresent(Int.self, forKey: .steps) ?? 0
        walkingRunningDistanceMeters = try values.decodeIfPresent(Double.self, forKey: .walkingRunningDistanceMeters) ?? 0
        activeEnergyKcal = try values.decodeIfPresent(Double.self, forKey: .activeEnergyKcal) ?? 0
        exerciseMinutes = try values.decodeIfPresent(Int.self, forKey: .exerciseMinutes) ?? 0
        standHours = try values.decodeIfPresent(Double.self, forKey: .standHours)
        sleepMinutes = try values.decodeIfPresent(Int.self, forKey: .sleepMinutes) ?? 0
        sleepStartAt = try values.decodeIfPresent(String.self, forKey: .sleepStartAt)
        sleepEndAt = try values.decodeIfPresent(String.self, forKey: .sleepEndAt)
        restingHeartRateBpm = try values.decodeIfPresent(Double.self, forKey: .restingHeartRateBpm)
        hrvMilliseconds = try values.decodeIfPresent(Double.self, forKey: .hrvMilliseconds)
        workoutCount = try values.decodeIfPresent(Int.self, forKey: .workoutCount) ?? 0
        workoutMinutes = try values.decodeIfPresent(Int.self, forKey: .workoutMinutes) ?? 0
        workoutEnergyKcal = try values.decodeIfPresent(Double.self, forKey: .workoutEnergyKcal) ?? 0
    }
}

/// A normalized HealthKit workout. Raw samples and route data stay on-device.
public struct HealthWorkoutSummaryModel: Codable, Equatable, Sendable, Identifiable {
    public let source: HealthSource
    public let deviceId: String
    public let healthKitUUID: String
    public var activityType: String
    public var startAt: String
    public var endAt: String
    public var durationSeconds: Int
    public var energyKcal: Double?
    public var sourceBundle: String?
    public var deviceName: String?

    public var id: String {
        Self.identity(source: source, deviceId: deviceId, healthKitUUID: healthKitUUID)
    }

    public init(
        source: HealthSource = .healthKit,
        deviceId: String,
        healthKitUUID: String,
        activityType: String,
        startAt: String,
        endAt: String,
        durationSeconds: Int,
        energyKcal: Double? = nil,
        sourceBundle: String? = nil,
        deviceName: String? = nil
    ) {
        self.source = source
        self.deviceId = deviceId
        self.healthKitUUID = healthKitUUID
        self.activityType = activityType
        self.startAt = startAt
        self.endAt = endAt
        self.durationSeconds = durationSeconds
        self.energyKcal = energyKcal
        self.sourceBundle = sourceBundle
        self.deviceName = deviceName
    }

    public static func identity(source: HealthSource, deviceId: String, healthKitUUID: String) -> String {
        "\(source.rawValue)|\(deviceId)|\(healthKitUUID)"
    }

    // These aliases keep the model readable at HealthKit call sites while
    // preserving the API's startAt/endAt vocabulary.
    public var startedAt: String { startAt }
    public var endedAt: String { endAt }
    public var energy: Double? { energyKcal }

    private enum CodingKeys: String, CodingKey {
        case source, deviceId, healthKitUUID, activityType, startAt, endAt, durationSeconds
        case energyKcal, sourceBundle, deviceName
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        source = try values.decodeIfPresent(HealthSource.self, forKey: .source) ?? .healthKit
        deviceId = try values.decodeIfPresent(String.self, forKey: .deviceId) ?? ""
        healthKitUUID = try values.decodeIfPresent(String.self, forKey: .healthKitUUID) ?? ""
        activityType = try values.decodeIfPresent(String.self, forKey: .activityType) ?? ""
        startAt = try values.decodeIfPresent(String.self, forKey: .startAt) ?? ""
        endAt = try values.decodeIfPresent(String.self, forKey: .endAt) ?? ""
        durationSeconds = try values.decodeIfPresent(Int.self, forKey: .durationSeconds) ?? 0
        energyKcal = try values.decodeIfPresent(Double.self, forKey: .energyKcal)
        sourceBundle = try values.decodeIfPresent(String.self, forKey: .sourceBundle)
        deviceName = try values.decodeIfPresent(String.self, forKey: .deviceName)
    }
}

/// Opaque HealthKit anchors. Their contents are owned by HealthKit and are
/// persisted only after the corresponding normalized records are durable.
public struct HealthImportState: Codable, Equatable, Sendable {
    public var anchors: [String: String]
    public var lastSuccessfulImportAt: String?

    public init(anchors: [String: String], lastSuccessfulImportAt: String? = nil) {
        self.anchors = anchors
        self.lastSuccessfulImportAt = lastSuccessfulImportAt
    }

    public init(
        dailySummaryAnchor: String? = nil,
        workoutAnchor: String? = nil,
        lastSuccessfulImportAt: String? = nil
    ) {
        var anchors: [String: String] = [:]
        if let dailySummaryAnchor { anchors["dailySummary"] = dailySummaryAnchor }
        if let workoutAnchor { anchors["workout"] = workoutAnchor }
        self.init(anchors: anchors, lastSuccessfulImportAt: lastSuccessfulImportAt)
    }

    public var dailySummaryAnchor: String? {
        get { anchors["dailySummary"] }
        set { anchors["dailySummary"] = newValue }
    }

    public var workoutAnchor: String? {
        get { anchors["workout"] }
        set { anchors["workout"] = newValue }
    }

    private enum CodingKeys: String, CodingKey {
        case anchors, dailySummaryAnchor, workoutAnchor, lastSuccessfulImportAt
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        var decodedAnchors = try values.decodeIfPresent([String: String].self, forKey: .anchors) ?? [:]
        if let value = try values.decodeIfPresent(String.self, forKey: .dailySummaryAnchor) {
            decodedAnchors["dailySummary"] = value
        }
        if let value = try values.decodeIfPresent(String.self, forKey: .workoutAnchor) {
            decodedAnchors["workout"] = value
        }
        anchors = decodedAnchors
        lastSuccessfulImportAt = try values.decodeIfPresent(String.self, forKey: .lastSuccessfulImportAt)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(anchors, forKey: .anchors)
        try values.encodeIfPresent(lastSuccessfulImportAt, forKey: .lastSuccessfulImportAt)
    }
}
