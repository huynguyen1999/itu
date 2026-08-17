@preconcurrency import HealthKit
import Combine
import Foundation
import iTuDomain
import iTuOffline

enum IOSHealthAuthorizationState: Equatable {
    case unavailable
    case notDetermined
    case requested
    case requesting
    case failed(String)

    var title: String {
        switch self {
        case .unavailable: "Unavailable on this device"
        case .notDetermined: "Not requested"
        case .requested: "Read and write access requested"
        case .requesting: "Requesting access…"
        case .failed: "Could not request access"
        }
    }

    var detail: String {
        switch self {
        case .unavailable: "HealthKit is not available on this device."
        case .notDetermined: "iTu can read selected HealthKit summaries and can save completed Gym workouts when you explicitly choose that action. Normalized summaries and workout metadata sync to your iTu account; raw samples stay on this device."
        case .requested: "HealthKit does not reveal whether each type was individually allowed. If data is missing or a workout cannot be saved, review Settings > Health > Apps > iTu. Normalized summaries and workout metadata sync to your iTu account; raw samples stay on this device."
        case .requesting: "Waiting for the HealthKit permission sheet…"
        case .failed(let message): message
        }
    }

    var canRequest: Bool {
        switch self {
        case .notDetermined, .failed: true
        case .unavailable, .requested, .requesting: false
        }
    }
}

enum IOSHealthImportStatus: Equatable {
    case unavailable
    case idle
    case importing
    case imported
    case partial(String)
    case failed(String)

    var title: String {
        switch self {
        case .unavailable: "Unavailable"
        case .idle: "Not imported yet"
        case .importing: "Importing…"
        case .imported: "Imported on this device"
        case .partial: "Partially imported"
        case .failed: "Import failed"
        }
    }
}

enum IOSHealthKitData {
    static let permissionRequestedKey = "com.itu.ios.health.read-permission-requested"
    static let gymWorkoutIDKey = "com.itu.gymWorkoutID"

    static let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
        .stepCount,
        .distanceWalkingRunning,
        .activeEnergyBurned,
        .appleExerciseTime,
        .appleStandTime,
        .restingHeartRate,
        .heartRateVariabilitySDNN
    ]

    static let categoryIdentifiers: [HKCategoryTypeIdentifier] = [.sleepAnalysis]

    static var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        quantityIdentifiers.compactMap(HKObjectType.quantityType(forIdentifier:)).forEach { types.insert($0) }
        categoryIdentifiers.compactMap(HKObjectType.categoryType(forIdentifier:)).forEach { types.insert($0) }
        types.insert(HKObjectType.workoutType())
        return types
    }

    static var writeTypes: Set<HKSampleType> {
        [HKObjectType.workoutType()]
    }

    static var observerTypes: [HKSampleType] {
        readTypes.compactMap { $0 as? HKSampleType }
    }
}

enum IOSHealthKitAnchorCodec {
    static func encode(_ anchor: HKQueryAnchor?) -> String? {
        guard let anchor,
              let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: false) else {
            return nil
        }
        return data.base64EncodedString()
    }

    static func decode(_ value: String?) -> HKQueryAnchor? {
        guard let value,
              let data = Data(base64Encoded: value),
              let object = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data) else {
            return nil
        }
        return object
    }
}

enum IOSHealthKitNormalizer {
    static func localDate(for date: Date) -> String {
        iTuCalendarSupport.dayString(date)
    }

    static func timestamp(for date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    static func dayStart(for localDate: String) -> Date? {
        let components = localDate.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return nil }
        return iTuCalendarSupport.calendar().date(from: DateComponents(
            calendar: iTuCalendarSupport.calendar(),
            timeZone: iTuCalendarSupport.timezone,
            year: components[0],
            month: components[1],
            day: components[2]
        ))
    }

    static func dayRange(for localDate: String) -> (start: Date, end: Date)? {
        guard let start = dayStart(for: localDate),
              let end = iTuCalendarSupport.calendar().date(byAdding: .day, value: 1, to: start) else { return nil }
        return (start, end)
    }

    static func clippedInterval(
        start: Date,
        end: Date,
        to localDate: String
    ) -> (start: Date, end: Date)? {
        guard end > start, let range = dayRange(for: localDate) else { return nil }
        let clippedStart = max(start, range.start)
        let clippedEnd = min(end, range.end)
        guard clippedEnd > clippedStart else { return nil }
        return (clippedStart, clippedEnd)
    }

    static func overlappingLocalDates(start: Date, end: Date) -> Set<String> {
        guard end > start, var cursor = dayStart(for: localDate(for: start)) else { return [] }
        var dates = Set<String>()
        let calendar = iTuCalendarSupport.calendar()
        while cursor < end {
            dates.insert(localDate(for: cursor))
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return dates
    }

    static func standHours(fromMinutes minutes: Double) -> Double {
        minutes / 60
    }

    static func currentHealthKitSummaries(
        from summaries: [HealthDailySummaryModel],
        deviceID: String
    ) -> [HealthDailySummaryModel] {
        summaries.filter { $0.source == .healthKit && $0.deviceId == deviceID }
    }
}

/// A one-shot, thread-safe holder for an HK observer completion callback.
/// HealthKit requires this callback to be invoked after the observer event has
/// been handled; the app owns the actual import and calls `finish()` only once
/// its account-scoped durable write has completed.
final class IOSHealthObserverCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private let callback: () -> Void
    private var finished = false

    init(_ callback: @escaping () -> Void) {
        self.callback = callback
    }

    func finish() {
        lock.lock()
        guard !finished else {
            lock.unlock()
            return
        }
        finished = true
        lock.unlock()
        callback()
    }
}

private struct IOSHealthAnchoredResult {
    let samples: [HKSample]
    let deletedObjects: [HKDeletedObject]
    let anchor: HKQueryAnchor?
}

private struct IOSHealthMetricValues {
    var steps = 0
    var walkingRunningDistanceMeters = 0.0
    var activeEnergyKcal = 0.0
    var exerciseMinutes = 0
    var standHours: Double?
    var restingHeartRateBpm: Double?
    var hrvMilliseconds: Double?
    var sleepMinutes = 0
    var sleepStartAt: String?
    var sleepEndAt: String?
    var workoutCount = 0
    var workoutMinutes = 0
    var workoutEnergyKcal = 0.0
}

struct IOSHealthImportResult {
    let dailySummaries: [HealthDailySummaryModel]
    let workouts: [HealthWorkoutSummaryModel]
    let deletedWorkouts: [HealthWorkoutSummaryModel]
    let importState: HealthImportState
    let partialErrors: [String]
}

@MainActor
final class IOSHealthKitPipeline: ObservableObject {
    @Published private(set) var authorizationState: IOSHealthAuthorizationState
    @Published private(set) var importStatus: IOSHealthImportStatus = .idle

    private let healthStore: HKHealthStore
    private let defaults: UserDefaults
    private var observerQueries: [HKObserverQuery] = []
    private var onChange: (@MainActor @Sendable (IOSHealthObserverCompletion) -> Void)?

    init(healthStore: HKHealthStore = HKHealthStore(), defaults: UserDefaults = .standard) {
        self.healthStore = healthStore
        self.defaults = defaults
        if !HKHealthStore.isHealthDataAvailable() {
            authorizationState = .unavailable
        } else if defaults.bool(forKey: IOSHealthKitData.permissionRequestedKey) {
            authorizationState = .requested
        } else {
            authorizationState = .notDetermined
        }
    }

    func refreshAuthorizationState() {
        guard HKHealthStore.isHealthDataAvailable() else {
            authorizationState = .unavailable
            return
        }
        if authorizationState != .requesting {
            authorizationState = defaults.bool(forKey: IOSHealthKitData.permissionRequestedKey) ? .requested : .notDetermined
        }
    }

    func requestReadAccess() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            authorizationState = .unavailable
            return false
        }
        guard authorizationState != .requesting else { return false }
        authorizationState = .requesting
        do {
            try await healthStore.requestAuthorization(toShare: IOSHealthKitData.writeTypes, read: IOSHealthKitData.readTypes)
            defaults.set(true, forKey: IOSHealthKitData.permissionRequestedKey)
            authorizationState = .requested
            startObservers()
            return true
        } catch {
            authorizationState = .failed(error.localizedDescription)
            return false
        }
    }

    /// Writes one completed iTu Gym workout to HealthKit. The custom metadata
    /// key makes retries idempotent and lets the importer ignore iTu-owned
    /// workouts rather than counting them as external activity.
    func writeGymWorkout(_ workout: WorkoutModel) async throws -> IOSHealthKitWriteResult {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw IOSHealthKitError.unavailable
        }
        guard let start = iTuDateSupport.parse(workout.startedAt ?? ""),
              let end = iTuDateSupport.parse(workout.endedAt ?? ""),
              end > start else {
            throw IOSHealthKitError.invalidWorkout
        }

        let existing = try await samples(
            for: HKObjectType.workoutType(),
            localDate: IOSHealthKitNormalizer.localDate(for: start)
        )
        if existing
            .compactMap({ $0 as? HKWorkout })
            .contains(where: { $0.metadata?[IOSHealthKitData.gymWorkoutIDKey] as? String == workout.id }) {
            return .alreadySaved
        }

        let healthWorkout = HKWorkout(
            activityType: .traditionalStrengthTraining,
            start: start,
            end: end,
            duration: end.timeIntervalSince(start),
            totalEnergyBurned: nil,
            totalDistance: nil,
            metadata: [
                IOSHealthKitData.gymWorkoutIDKey: workout.id,
                HKMetadataKeyWorkoutBrandName: "iTu"
            ]
        )
        try await healthStore.save(healthWorkout)
        return .saved
    }

    func start(onChange: @escaping @MainActor @Sendable (IOSHealthObserverCompletion) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            authorizationState = .unavailable
            return
        }
        self.onChange = onChange
        guard authorizationState == .requested else { return }
        startObservers()
    }

    func stop() {
        observerQueries.forEach(healthStore.stop)
        observerQueries.removeAll()
        healthStore.disableAllBackgroundDelivery { _, _ in }
        onChange = nil
    }

    func importNow(
        deviceID: String,
        existingSummaries: [HealthDailySummaryModel],
        existingImportState: HealthImportState
    ) async throws -> IOSHealthImportResult {
        guard HKHealthStore.isHealthDataAvailable() else {
            importStatus = .unavailable
            throw IOSHealthKitError.unavailable
        }
        importStatus = .importing
        var nextAnchors = existingImportState.anchors
        var partialErrors: [String] = []
        let currentSummaries = IOSHealthKitNormalizer.currentHealthKitSummaries(
            from: existingSummaries,
            deviceID: deviceID
        )
        let existingDates = Set(currentSummaries.map(\.localDate))
        var touchedDates = Set<String>()
        var successfulQuantityIDs = Set<String>()
        var successfulCategoryIDs = Set<String>()
        var successfulWorkout = false
        var metricValues: [String: IOSHealthMetricValues] = [:]
        var importedWorkouts: [HealthWorkoutSummaryModel] = []
        var deletedWorkouts: [HealthWorkoutSummaryModel] = []

        for identifier in IOSHealthKitData.quantityIdentifiers {
            guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
            let key = identifier.rawValue
            do {
                let result = try await anchoredResult(for: type, anchor: IOSHealthKitAnchorCodec.decode(existingImportState.anchors[key]))
                var dates = dates(for: result.samples)
                if !result.deletedObjects.isEmpty { dates.formUnion(existingDates) }
                var valuesByDate: [String: Double] = [:]
                var failed = false
                for date in dates {
                    do {
                        valuesByDate[date] = try await quantityValue(type: type, identifier: identifier, localDate: date)
                    } catch {
                        partialErrors.append("\(key): \(error.localizedDescription)")
                        failed = true
                    }
                }
                guard !failed else { continue }
                successfulQuantityIDs.insert(key)
                touchedDates.formUnion(dates)
                for (date, value) in valuesByDate {
                    var metrics = metricValues[date, default: IOSHealthMetricValues()]
                    switch identifier {
                    case .stepCount: metrics.steps = Int(value.rounded())
                    case .distanceWalkingRunning: metrics.walkingRunningDistanceMeters = value
                    case .activeEnergyBurned: metrics.activeEnergyKcal = value
                    case .appleExerciseTime: metrics.exerciseMinutes = Int(value.rounded())
                    case .appleStandTime: metrics.standHours = IOSHealthKitNormalizer.standHours(fromMinutes: value)
                    case .restingHeartRate: metrics.restingHeartRateBpm = value
                    case .heartRateVariabilitySDNN: metrics.hrvMilliseconds = value
                    default: break
                    }
                    metricValues[date] = metrics
                }
                if let anchor = IOSHealthKitAnchorCodec.encode(result.anchor) { nextAnchors[key] = anchor }
            } catch {
                partialErrors.append("\(key): \(error.localizedDescription)")
            }
        }

        for identifier in IOSHealthKitData.categoryIdentifiers {
            guard let type = HKObjectType.categoryType(forIdentifier: identifier) else { continue }
            let key = identifier.rawValue
            do {
                let result = try await anchoredResult(for: type, anchor: IOSHealthKitAnchorCodec.decode(existingImportState.anchors[key]))
                var dates = result.samples.reduce(into: Set<String>()) { dates, sample in
                    dates.formUnion(IOSHealthKitNormalizer.overlappingLocalDates(start: sample.startDate, end: sample.endDate))
                }
                if !result.deletedObjects.isEmpty { dates.formUnion(existingDates) }
                var valuesByDate: [String: IOSHealthMetricValues] = [:]
                var failed = false
                for date in dates {
                    do { valuesByDate[date] = try await sleepValues(localDate: date) }
                    catch {
                        partialErrors.append("\(key): \(error.localizedDescription)")
                        failed = true
                    }
                }
                guard !failed else { continue }
                successfulCategoryIDs.insert(key)
                touchedDates.formUnion(dates)
                for (date, values) in valuesByDate {
                    var metrics = metricValues[date, default: IOSHealthMetricValues()]
                    metrics.sleepMinutes = values.sleepMinutes
                    metrics.sleepStartAt = values.sleepStartAt
                    metrics.sleepEndAt = values.sleepEndAt
                    metricValues[date] = metrics
                }
                if let anchor = IOSHealthKitAnchorCodec.encode(result.anchor) { nextAnchors[key] = anchor }
            } catch {
                partialErrors.append("\(key): \(error.localizedDescription)")
            }
        }

        do {
            let type = HKObjectType.workoutType()
            let result = try await anchoredResult(for: type, anchor: IOSHealthKitAnchorCodec.decode(existingImportState.anchors["workout"]))
            var dates = dates(for: result.samples)
            if !result.deletedObjects.isEmpty { dates.formUnion(existingDates) }
            var valuesByDate: [String: IOSHealthMetricValues] = [:]
            var failed = false
            for date in dates {
                do { valuesByDate[date] = try await workoutValues(localDate: date) }
                catch {
                    partialErrors.append("workout: \(error.localizedDescription)")
                    failed = true
                }
            }
            if !failed {
                successfulWorkout = true
                touchedDates.formUnion(dates)
                for (date, values) in valuesByDate {
                    var metrics = metricValues[date, default: IOSHealthMetricValues()]
                    metrics.workoutCount = values.workoutCount
                    metrics.workoutMinutes = values.workoutMinutes
                    metrics.workoutEnergyKcal = values.workoutEnergyKcal
                    metricValues[date] = metrics
                }
                importedWorkouts = result.samples.compactMap { sample in
                    guard let workout = sample as? HKWorkout, !Self.isITuOwned(workout) else { return nil }
                    return HealthWorkoutSummaryModel(
                        source: .healthKit,
                        deviceId: deviceID,
                        healthKitUUID: workout.uuid.uuidString,
                        activityType: String(workout.workoutActivityType.rawValue),
                        startAt: IOSHealthKitNormalizer.timestamp(for: workout.startDate),
                        endAt: IOSHealthKitNormalizer.timestamp(for: workout.endDate),
                        durationSeconds: Int(workout.duration.rounded()),
                        energyKcal: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                        sourceBundle: workout.sourceRevision.source.bundleIdentifier,
                        deviceName: workout.device?.name
                    )
                }
                deletedWorkouts = result.deletedObjects.map {
                    HealthWorkoutSummaryModel(
                        source: .healthKit,
                        deviceId: deviceID,
                        healthKitUUID: $0.uuid.uuidString,
                        activityType: "",
                        startAt: "",
                        endAt: "",
                        durationSeconds: 0
                    )
                }
                if let anchor = IOSHealthKitAnchorCodec.encode(result.anchor) { nextAnchors["workout"] = anchor }
            }
        } catch {
            partialErrors.append("workout: \(error.localizedDescription)")
        }

        var summaries: [HealthDailySummaryModel] = []
        let existingByDate = Dictionary(currentSummaries.map { ($0.localDate, $0) }, uniquingKeysWith: { first, _ in first })
        for date in touchedDates {
            var existing = existingByDate[date] ?? HealthDailySummaryModel(deviceId: deviceID, localDate: date)
            let values = metricValues[date, default: IOSHealthMetricValues()]
            existing = HealthDailySummaryModel(
                source: .healthKit,
                deviceId: deviceID,
                localDate: date,
                steps: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.stepCount.rawValue) ? values.steps : existing.steps,
                walkingRunningDistanceMeters: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue) ? values.walkingRunningDistanceMeters : existing.walkingRunningDistanceMeters,
                activeEnergyKcal: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.activeEnergyBurned.rawValue) ? values.activeEnergyKcal : existing.activeEnergyKcal,
                exerciseMinutes: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.appleExerciseTime.rawValue) ? values.exerciseMinutes : existing.exerciseMinutes,
                standHours: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.appleStandTime.rawValue) ? (values.standHours ?? 0) : existing.standHours,
                sleepMinutes: successfulCategoryIDs.contains(HKCategoryTypeIdentifier.sleepAnalysis.rawValue) ? values.sleepMinutes : existing.sleepMinutes,
                sleepStartAt: successfulCategoryIDs.contains(HKCategoryTypeIdentifier.sleepAnalysis.rawValue) ? values.sleepStartAt : existing.sleepStartAt,
                sleepEndAt: successfulCategoryIDs.contains(HKCategoryTypeIdentifier.sleepAnalysis.rawValue) ? values.sleepEndAt : existing.sleepEndAt,
                restingHeartRateBpm: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.restingHeartRate.rawValue) ? values.restingHeartRateBpm : existing.restingHeartRateBpm,
                hrvMilliseconds: successfulQuantityIDs.contains(HKQuantityTypeIdentifier.heartRateVariabilitySDNN.rawValue) ? values.hrvMilliseconds : existing.hrvMilliseconds,
                workoutCount: successfulWorkout ? values.workoutCount : existing.workoutCount,
                workoutMinutes: successfulWorkout ? values.workoutMinutes : existing.workoutMinutes,
                workoutEnergyKcal: successfulWorkout ? values.workoutEnergyKcal : existing.workoutEnergyKcal
            )
            summaries.append(existing)
        }

        let updatedAt = IOSHealthKitNormalizer.timestamp(for: Date())
        let importState = HealthImportState(anchors: nextAnchors, lastSuccessfulImportAt: partialErrors.isEmpty ? updatedAt : existingImportState.lastSuccessfulImportAt)
        return IOSHealthImportResult(
            dailySummaries: summaries,
            workouts: importedWorkouts,
            deletedWorkouts: deletedWorkouts,
            importState: importState,
            partialErrors: partialErrors
        )
    }

    private func startObservers() {
        guard observerQueries.isEmpty else { return }
        for type in IOSHealthKitData.observerTypes {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                let completion = IOSHealthObserverCompletion(completionHandler)
                guard error == nil else {
                    completion.finish()
                    return
                }
                Task { @MainActor [weak self] in
                    guard let self, let onChange = self.onChange else {
                        completion.finish()
                        return
                    }
                    onChange(completion)
                }
            }
            observerQueries.append(query)
            healthStore.execute(query)
            healthStore.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    private func anchoredResult(for type: HKSampleType, anchor: HKQueryAnchor?) async throws -> IOSHealthAnchoredResult {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: type,
                predicate: nil,
                anchor: anchor,
                limit: HKObjectQueryNoLimit
            ) { _, samples, deletedObjects, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: IOSHealthAnchoredResult(
                        samples: samples ?? [],
                        deletedObjects: deletedObjects ?? [],
                        anchor: newAnchor
                    ))
                }
            }
            healthStore.execute(query)
        }
    }

    private func quantityValue(type: HKQuantityType, identifier: HKQuantityTypeIdentifier, localDate: String) async throws -> Double {
        let samples = try await samples(for: type, localDate: localDate)
        let unit: HKUnit
        switch identifier {
        case .stepCount: unit = .count()
        case .distanceWalkingRunning: unit = .meter()
        case .activeEnergyBurned: unit = .kilocalorie()
        case .appleExerciseTime: unit = .minute()
        case .appleStandTime: unit = .minute()
        case .restingHeartRate: unit = .count().unitDivided(by: .minute())
        case .heartRateVariabilitySDNN: unit = .secondUnit(with: .milli)
        default: return 0
        }
        let quantities = samples.compactMap { ($0 as? HKQuantitySample)?.quantity.doubleValue(for: unit) }
        if identifier == .restingHeartRate || identifier == .heartRateVariabilitySDNN {
            return quantities.last ?? 0
        }
        return quantities.reduce(0, +)
    }

    private func sleepValues(localDate: String) async throws -> IOSHealthMetricValues {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return IOSHealthMetricValues() }
        let samples = try await samples(for: type, localDate: localDate, overlapping: true).compactMap { $0 as? HKCategorySample }
        let asleepValues = Set([
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
        ])
        let asleep = samples.filter { asleepValues.contains($0.value) || $0.value > HKCategoryValueSleepAnalysis.awake.rawValue }
        let intervals = asleep.compactMap { sample in
            IOSHealthKitNormalizer.clippedInterval(start: sample.startDate, end: sample.endDate, to: localDate)
        }
        let minutes = intervals.reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) / 60 }
        let start = intervals.map(\.start).min().map(IOSHealthKitNormalizer.timestamp(for:))
        let end = intervals.map(\.end).max().map(IOSHealthKitNormalizer.timestamp(for:))
        var values = IOSHealthMetricValues()
        values.sleepMinutes = Int(minutes.rounded())
        values.sleepStartAt = start
        values.sleepEndAt = end
        return values
    }

    private func workoutValues(localDate: String) async throws -> IOSHealthMetricValues {
        let samples = try await samples(for: HKObjectType.workoutType(), localDate: localDate)
            .compactMap { $0 as? HKWorkout }
            .filter { !Self.isITuOwned($0) }
        var values = IOSHealthMetricValues()
        values.workoutCount = samples.count
        values.workoutMinutes = Int((samples.reduce(0) { $0 + $1.duration } / 60).rounded())
        values.workoutEnergyKcal = samples.reduce(0) { $0 + ($1.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0) }
        return values
    }

    private func samples(for type: HKSampleType, localDate: String, overlapping: Bool = false) async throws -> [HKSample] {
        guard let range = IOSHealthKitNormalizer.dayRange(for: localDate) else { return [] }
        // Sleep intervals can cross midnight; point samples and workouts keep
        // strict starts so a cross-midnight workout is not counted twice.
        let options: HKQueryOptions = overlapping ? [] : [.strictStartDate]
        let predicate = HKQuery.predicateForSamples(withStart: range.start, end: range.end, options: options)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: samples ?? []) }
            }
            healthStore.execute(query)
        }
    }

    private func dates(for samples: [HKSample]) -> Set<String> {
        Set(samples.map { IOSHealthKitNormalizer.localDate(for: $0.startDate) })
    }

    private static func isITuOwned(_ workout: HKWorkout) -> Bool {
        if workout.metadata?[IOSHealthKitData.gymWorkoutIDKey] != nil { return true }
        guard let metadata = workout.metadata else { return false }
        return metadata.values.contains { value in
            let text = String(describing: value).lowercased()
            return text.contains("com.itu") || text.contains("itu:")
        }
    }
}

enum IOSHealthKitWriteResult: Equatable {
    case saved
    case alreadySaved
}

enum IOSHealthKitError: LocalizedError {
    case unavailable
    case invalidWorkout

    var errorDescription: String? {
        switch self {
        case .unavailable: "HealthKit is unavailable on this device."
        case .invalidWorkout: "This workout does not have a valid start and end time."
        }
    }
}
