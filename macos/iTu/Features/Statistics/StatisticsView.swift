import Charts
import SwiftUI
import AppKit
import ServiceManagement

struct StatisticsWebsiteSlice: Identifiable, Equatable {
    let hostname: String
    let activeSeconds: Int
    var id: String { hostname }
}

enum StatisticsDisplayHelpers {
    static func topWebsiteSlices(_ domains: [StatisticsWebsiteSlice], limit: Int) -> [StatisticsWebsiteSlice] {
        let sorted = domains.sorted { $0.activeSeconds == $1.activeSeconds ? $0.hostname < $1.hostname : $0.activeSeconds > $1.activeSeconds }
        let count = min(10, max(1, limit))
        guard sorted.count > count else { return sorted }
        let top = Array(sorted.prefix(count))
        let otherSeconds = sorted.dropFirst(count).reduce(0) { $0 + $1.activeSeconds }
        return top + [StatisticsWebsiteSlice(hostname: "Other", activeSeconds: otherSeconds)]
    }

    static func websiteSlices(
        filteredDetails: [WebsiteUsageURLDetail],
        privacyFilter: WebsiteActivityPrivacyFilter,
        fallback: [StatisticsWebsiteSlice],
        limit: Int
    ) -> [StatisticsWebsiteSlice] {
        if !filteredDetails.isEmpty {
            let totals = filteredDetails.reduce(into: [String: Int]()) { $0[$1.hostname, default: 0] += $1.activeSeconds }
            return topWebsiteSlices(totals.map { StatisticsWebsiteSlice(hostname: $0.key, activeSeconds: $0.value) }, limit: limit)
        }
        // Aggregate hostnames and local summaries do not carry privacy metadata;
        // never surface them for a filtered view when no matching URL details exist.
        if privacyFilter != .all { return [] }
        return topWebsiteSlices(fallback, limit: limit)
    }

    static func filteredWebsiteDetails(
        _ details: [WebsiteUsageURLDetail],
        filter: WebsiteActivityPrivacyFilter
    ) -> [WebsiteUsageURLDetail] {
        details.filter { filter.matches(isPrivate: $0.isPrivate) }
    }

    static func filteredWebsiteSessions(
        _ sessions: [WebsiteUsageSession],
        filter: WebsiteActivityPrivacyFilter
    ) -> [WebsiteUsageSession] {
        sessions.filter { filter.matches(isPrivate: $0.isPrivate) }
    }

    static func websiteTitle(_ detail: WebsiteUsageURLDetail) -> String {
        detail.latestTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? detail.latestTitle!
            : detail.url
    }
}

struct StatisticsView: View {
    @Environment(AppModel.self) var model

    @SceneStorage("statistics.timeRange") var timeRange: String = "30 Days"
    @SceneStorage("statistics.customFromDate") private var customFromTimestamp = (Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()).timeIntervalSinceReferenceDate
    @SceneStorage("statistics.customToDate") private var customToTimestamp = Date().timeIntervalSinceReferenceDate
    @SceneStorage("statistics.didHydrateDefaultRange") var didHydrateDefaultRange = false
    @State var showingSettings = false
    @State var showingDiagnostics = false
    @State var statisticsStore = StatisticsStore()
    @SceneStorage("statistics.showingUsageDetail") var showingUsageDetail = true
    @State var isAppListExpanded = false
    @State var appSearchQuery = ""
    @State var selectedAppDetail: UsageTopApp? = nil
    @SceneStorage("statistics.websitePrivacyFilter") private var websitePrivacyFilterRaw = WebsiteActivityPrivacyFilter.all.rawValue

    var customFromDate: Date {
        Date(timeIntervalSinceReferenceDate: customFromTimestamp)
    }

    var customToDate: Date {
        Date(timeIntervalSinceReferenceDate: customToTimestamp)
    }

    var websitePrivacyFilter: WebsiteActivityPrivacyFilter {
        WebsiteActivityPrivacyFilter(rawValue: websitePrivacyFilterRaw) ?? .all
    }

    var customFromDateBinding: Binding<Date> {
        Binding(get: { customFromDate }, set: { customFromTimestamp = $0.timeIntervalSinceReferenceDate })
    }

    var customToDateBinding: Binding<Date> {
        Binding(get: { customToDate }, set: { customToTimestamp = $0.timeIntervalSinceReferenceDate })
    }

    var websitePrivacyFilterBinding: Binding<WebsiteActivityPrivacyFilter> {
        Binding(get: { websitePrivacyFilter }, set: { websitePrivacyFilterRaw = $0.rawValue })
    }

    var selectedPeriod: StatisticsPeriod {
        timeRange == "Custom"
            ? StatisticsPeriod.custom(from: customFromDate, to: customToDate, grouping: displaySettings.grouping)
            : StatisticsPeriod.preset(timeRange, grouping: displaySettings.grouping)
    }

    var customFromKey: String { Self.dateKey(customFromDate) }
    var customToKey: String { Self.dateKey(customToDate) }

    private var visibleCalendar: [StudyCalendarDayDTO] {
        model.statisticsCalendar.filter { $0.date >= selectedPeriod.from && $0.date <= selectedPeriod.to }
    }

    private var previousCalendar: [StudyCalendarDayDTO] {
        model.statisticsComparisonCalendar.filter { $0.date >= selectedPeriod.comparisonFrom && $0.date <= selectedPeriod.comparisonTo }
    }

    var trendCalendar: [StudyCalendarDayDTO] {
        guard displaySettings.grouping != .day else { return visibleCalendar }
        let grouped = Dictionary(grouping: visibleCalendar) { bucketKey(for: $0.date) }
        return grouped.map { key, days in
            StudyCalendarDayDTO(
                date: key,
                sessions: days.reduce(0) { $0 + $1.sessions },
                focusSessions: days.reduce(0) { $0 + $1.focusSessions },
                reviews: days.reduce(0) { $0 + $1.reviews },
                correct: days.reduce(0) { $0 + $1.correct },
                completedTasks: days.reduce(0) { $0 + $1.completedTasks },
                focusedMinutes: days.reduce(0) { $0 + $1.focusedMinutes },
                cardsCreated: days.reduce(0) { $0 + $1.cardsCreated }
            )
        }
        .sorted { $0.date < $1.date }
    }

    func bucketKey(for value: String) -> String {
        guard let date = StatisticsPeriod.date(from: value) else { return value }
        let bucket: Date
        switch displaySettings.grouping {
        case .day:
            bucket = date
        case .week:
            bucket = StatisticsPeriod.calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        case .month:
            bucket = StatisticsPeriod.calendar.dateInterval(of: .month, for: date)?.start ?? date
        }
        return Self.dateKey(bucket)
    }

    var selectedRangeLabel: String {
        let from = StatisticsPeriod.date(from: selectedPeriod.from) ?? Date()
        let to = StatisticsPeriod.date(from: selectedPeriod.to) ?? Date()
        return "\(from.formatted(.dateTime.month(.abbreviated).day())) – \(to.formatted(.dateTime.month(.abbreviated).day().year()))"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if model.statisticsError {
                    Label(
                        model.statisticsErrorMessage.map { "Some statistics could not be loaded: \($0)" }
                            ?? "Some statistics could not be loaded.",
                        systemImage: "exclamationmark.triangle"
                    )
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.coral)
                }
                StatisticsOverviewSection(store: statisticsStore, displaySettings: displaySettings)
                StatisticsDomainSummarySection(store: statisticsStore, displaySettings: displaySettings)
                if isDomainVisible(.digital) && (displaySettings.showAppUsage || displaySettings.showWebsiteUsage) {
                    DisclosureGroup(isExpanded: $showingUsageDetail) {
                        VStack(alignment: .leading, spacing: 14) {
                            if displaySettings.showAppUsage { usageSection }
                            if displaySettings.showWebsiteUsage { websiteUsageSection }
                        }
                    } label: {
                        Label("Usage detail", systemImage: "chart.bar.xaxis")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .padding(16)
                    .iTuPanel(radius: 12)
                }
                if isDomainVisible(.productivity) || isDomainVisible(.growth) {
                    StatisticsTrendSection(
                        calendar: trendCalendar,
                        growthTrend: growthTrendItems,
                        settings: displaySettings
                    )
                }
                if isDomainVisible(.growth) {
                    attributeDistributionSection
                    highestLevelAttributesSection
                }
                if isDomainVisible(.digital) && !displaySettings.showAppUsage && !displaySettings.showWebsiteUsage {
                    Text("Usage detail is hidden in Statistics settings. Other statistics remain available above.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .iTuPanel(radius: 12)
                }
            }
            .padding(24)
            .frame(maxWidth: 1280)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            iTuPageHeader(
                kicker: "ANALYTICS",
                title: "Statistics",
                description: "Tasks, deep work, learning, and Growth progress for \(selectedRangeLabel).",
                actions: {
                    rangePicker
                    refreshButton
                    settingsButton
                },
                controls: { customRangeControls }
            )
        }
        .background(iTuTheme.canvas)
        .onAppear {
            if !didHydrateDefaultRange {
                timeRange = displaySettings.defaultRange
                didHydrateDefaultRange = true
            }
            refreshForCurrentRange(force: false)
        }
        .onChange(of: timeRange) { _, _ in
            if timeRange != "Custom" { refreshForCurrentRange(force: true) }
        }
    }
    var attributeDistributionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Attribute Experience Distribution")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text("XP earned and lost by attribute inside the selected period.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)

            if let attributes = model.growthStatistics?.attributes, !attributes.isEmpty {
                Chart(attributes, id: \.skillId) { attribute in
                    BarMark(
                        x: .value("XP", attribute.net),
                        y: .value("Attribute", attribute.name)
                    )
                    .foregroundStyle(attribute.net >= 0 ? iTuTheme.mint : iTuTheme.coral)
                }
                .chartXAxis { AxisMarks(position: .bottom) }
                .chartYAxis { AxisMarks(position: .leading) }
                .frame(height: 180)

                VStack(spacing: 0) {
                    ForEach(attributes, id: \.skillId) { attribute in
                        HStack(spacing: 8) {
                            Text(attribute.name)
                                .font(.system(size: 12, weight: .medium))
                            Spacer()
                            Text("\(attribute.net >= 0 ? "+" : "")\(attribute.net) XP")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(attribute.net >= 0 ? iTuTheme.mint : iTuTheme.coral)
                        }
                        .padding(.vertical, 7)
                        .overlay(alignment: .bottom) { Divider() }
                    }
                }
            } else if model.statisticsLoading {
                ProgressView("Loading statistics…")
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else if model.growthStatisticsError {
                unavailableStatisticsState
            } else {
                Text("Complete rewarded activities to see attribute XP distribution.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 180)
            }
        }
        .padding(20)
        .iTuPanel(radius: 14)
    }

    private var unavailableStatisticsState: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(iTuTheme.coral)
            Text("Statistics unavailable")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 200)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    var highestLevelAttributesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Highest-level attributes")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text("Lifetime ranking with selected-period gains.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
            if highestLevelAttributes.isEmpty {
                Text("Create an attribute to start tracking levels.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                ForEach(Array(highestLevelAttributes.enumerated()), id: \.element.id) { index, attribute in
                    HStack(spacing: 12) {
                        Text("\(index + 1)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(iTuTheme.inkDim)
                            .frame(width: 18)
                        Image(systemName: attribute.icon)
                            .foregroundStyle(iTuTheme.teal)
                            .frame(width: 28, height: 28)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(attribute.name)
                                    .font(.system(size: 12, weight: .medium))
                                    .lineLimit(1)
                                Spacer()
                                Text("Level \(attribute.level)")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            ProgressView(value: Double(attribute.progressXP ?? attribute.currentXP), total: Double(max(1, attribute.requiredXP ?? attribute.nextLevelXP)))
                                .tint(iTuTheme.teal)
                            Text("\(attribute.progressXP ?? attribute.currentXP) / \(attribute.requiredXP ?? attribute.nextLevelXP) XP")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Divider() }
                }
            }
        }
        .padding(20)
        .iTuPanel(radius: 14)
    }

    func refreshForCurrentRange(force: Bool) {
        let period = selectedPeriod
        statisticsStore.refresh(using: model, period: period, force: force)
    }

    var usageFromKey: String {
        selectedPeriod.usageFrom
    }

    var usageToKey: String {
        selectedPeriod.usageTo
    }

    static var earliestDate: Date {
        StatisticsPeriod.date(from: StatisticsPeriod.addDays(StatisticsPeriod.dateKey(Date()), -364)) ?? Date()
    }

    private static func dateKey(_ date: Date) -> String {
        StatisticsPeriod.dateKey(date)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = StatisticsPeriod.calendar
        formatter.timeZone = StatisticsPeriod.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let isoFormatterNoFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

struct StatSummaryTile: View {
    let title: String
    let value: String
    var comparison: String? = nil
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 38, height: 38)
                .background(color.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                if let comparison {
                    Text(comparison)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
            Spacer()
        }
        .padding(12)
        .iTuPanel(radius: 12)
    }
}

struct UsageApplicationIcon: View {
    let bundleID: String
    let displayName: String
    let tint: Color

    var body: some View {
        Group {
            if let applicationURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) {
                Image(nsImage: NSWorkspace.shared.icon(forFile: applicationURL.path))
                    .resizable()
                    .scaledToFit()
            } else {
                Text(String(displayName.trimmingCharacters(in: .whitespacesAndNewlines).first ?? "?"))
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(tint)
            }
        }
        .frame(width: 30, height: 30)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityHidden(true)
    }
}

struct StatisticsSettingsPopover: View {
    @Environment(AppModel.self) private var model
    @State private var loginItemError: String?

    var body: some View {
        let settings = model.settingsStore
        FeatureSettingsPopoverShell(title: "Statistics settings") {
            FeatureSettingsSection(title: "Period & Grouping") {
                FeatureSettingsRow(label: "Default range") {
                    Picker("", selection: Binding(
                        get: { settings.statisticsDisplaySettings.defaultRange },
                        set: { settings.statisticsDisplaySettings.defaultRange = $0 }
                    )) {
                        Text("Today").tag("Today")
                        Text("7 days").tag("7 Days")
                        Text("30 days").tag("30 Days")
                        Text("3 months").tag("90 Days")
                        Text("1 year").tag("365 Days")
                    }
                    .pickerStyle(.menu)
                    .accessibilityLabel("Default statistics range")
                }
                FeatureSettingsRow(label: "Grouping") {
                    Picker("", selection: Binding(
                        get: { settings.statisticsDisplaySettings.grouping },
                        set: { settings.statisticsDisplaySettings.grouping = $0 }
                    )) {
                        ForEach(StatisticsGrouping.allCases) { grouping in
                            Text(grouping.label).tag(grouping)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityLabel("Statistics grouping")
                }
            }

            FeatureSettingsSection(title: "Display Preferences") {
                Toggle("Show trend comparison", isOn: Binding(
                    get: { settings.statisticsDisplaySettings.showTrendComparison },
                    set: { settings.statisticsDisplaySettings.showTrendComparison = $0 }
                ))
                Toggle("Show zero-value series", isOn: Binding(
                    get: { settings.statisticsDisplaySettings.showZeroValueSeries },
                    set: { settings.statisticsDisplaySettings.showZeroValueSeries = $0 }
                ))
            }

            FeatureSettingsSection(title: "Visible domains") {
                ForEach(StatisticsDomain.allCases) { domain in
                    Toggle(domain.label, isOn: Binding(
                        get: { settings.statisticsDisplaySettings.visibleDomains.contains(domain.rawValue) },
                        set: { enabled in
                            var visibleDomains = settings.statisticsDisplaySettings.visibleDomains
                            if enabled {
                                if !visibleDomains.contains(domain.rawValue) { visibleDomains.append(domain.rawValue) }
                            } else {
                                visibleDomains.removeAll { $0 == domain.rawValue }
                            }
                            settings.statisticsDisplaySettings.visibleDomains = visibleDomains
                        }
                    ))
                }
            }

            FeatureSettingsSection(title: "Usage detail (this device)") {
                Toggle("Show app usage", isOn: Binding(
                    get: { settings.statisticsDisplaySettings.showAppUsage },
                    set: { settings.statisticsDisplaySettings.showAppUsage = $0 }
                ))
                Toggle("Show website usage", isOn: Binding(
                    get: { settings.statisticsDisplaySettings.showWebsiteUsage },
                    set: { settings.statisticsDisplaySettings.showWebsiteUsage = $0 }
                ))
                Toggle("Show engagement", isOn: Binding(
                    get: { settings.statisticsDisplaySettings.showEngagement },
                    set: { settings.statisticsDisplaySettings.showEngagement = $0 }
                ))
                FeatureSettingsRow(label: "Top apps") {
                    Stepper(value: Binding(
                        get: { settings.statisticsDisplaySettings.topAppsCount },
                        set: { settings.statisticsDisplaySettings.topAppsCount = min(10, max(1, $0)) }
                    ), in: 1...10) { Text("\(settings.statisticsDisplaySettings.topAppsCount)") }
                    .accessibilityLabel("Top apps count")
                }
                FeatureSettingsRow(label: "Website slices") {
                    Stepper(value: Binding(
                        get: { settings.statisticsDisplaySettings.websiteSliceCount },
                        set: { settings.statisticsDisplaySettings.websiteSliceCount = min(10, max(1, $0)) }
                    ), in: 1...10) { Text("\(settings.statisticsDisplaySettings.websiteSliceCount)") }
                    .accessibilityLabel("Website slice count")
                }
                FeatureSettingsRow(label: "Chart density") {
                    Picker("", selection: Binding(
                        get: { settings.statisticsDisplaySettings.chartDensity },
                        set: { settings.statisticsDisplaySettings.chartDensity = $0 }
                    )) {
                        ForEach(StatisticsChartDensity.allCases) { density in
                            Text(density.label).tag(density)
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityLabel("Chart density")
                }
            }

            FeatureSettingsSection(title: "Tracking & data") {
                if let usageError = model.usageError {
                    Text(usageError)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.coral)
                }
                Toggle("Enable usage tracking", isOn: Binding(
                    get: { settings.usagePreferences.enabled },
                    set: { settings.usagePreferences.enabled = $0 }
                ))
                Toggle("Track website usage", isOn: Binding(
                    get: { settings.usagePreferences.websiteTrackingEnabled },
                    set: { settings.usagePreferences.websiteTrackingEnabled = $0 }
                ))
                .disabled(!settings.usagePreferences.enabled)
                Toggle("Pause website tracking", isOn: Binding(
                    get: { settings.usagePreferences.paused },
                    set: { settings.usagePreferences.paused = $0 }
                ))
                FeatureSettingsRow(label: "Retention") {
                    Stepper(value: Binding(
                        get: { settings.usagePreferences.retentionDays },
                        set: { settings.usagePreferences.retentionDays = min(365, max(7, $0)) }
                    ), in: 7...365, step: 7) { Text("\(settings.usagePreferences.retentionDays)d") }
                    .accessibilityLabel("Retention days")
                }
                Toggle("Launch at Login (this device)", isOn: Binding(
                    get: { settings.usagePreferences.launchAtLogin },
                    set: { value in
                        let previous = settings.usagePreferences.launchAtLogin
                        do {
                            if value { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                            settings.usagePreferences.launchAtLogin = value
                            loginItemError = nil
                        } catch {
                            settings.usagePreferences.launchAtLogin = previous
                            loginItemError = error.localizedDescription
                        }
                    }
                ))
                if let loginItemError {
                    Text(loginItemError).font(.system(size: 11)).foregroundStyle(iTuTheme.coral)
                }
            }
        }
    }
}
