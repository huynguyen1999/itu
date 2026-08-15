import Charts
import SwiftUI

struct UsageChartItem: Identifiable {
    let localDate: String
    let bundleId: String
    let displayName: String
    let activeSeconds: Int
    var id: String { "\(localDate)|\(bundleId)" }
}

extension StatisticsView {
    var websiteDomains: [StatisticsWebsiteSlice] {
        let fallback: [StatisticsWebsiteSlice]
        if websitePrivacyFilter == .all, let stats = model.websiteUsageStatistics, !stats.hostnames.isEmpty {
            // Hostname totals include local pending summary deltas merged by AppModel.
            fallback = stats.hostnames.map { StatisticsWebsiteSlice(hostname: $0.hostname, activeSeconds: $0.activeSeconds) }
        } else if let stats = model.websiteUsageStatistics, !stats.hostnames.isEmpty {
            fallback = stats.hostnames.map { StatisticsWebsiteSlice(hostname: $0.hostname, activeSeconds: $0.activeSeconds) }
        } else {
            let totals = model.localWebsiteUsageSummaries
                .filter { $0.localDate >= usageFromKey && $0.localDate <= usageToKey }
                .reduce(into: [String: Int]()) { $0[$1.hostname, default: 0] += $1.activeSeconds }
            fallback = totals.map { StatisticsWebsiteSlice(hostname: $0.key, activeSeconds: $0.value) }
        }
        let details = websitePrivacyFilter == .all && !(model.websiteUsageStatistics?.hostnames.isEmpty ?? true)
            ? []
            : websiteURLDetails
        return StatisticsDisplayHelpers.websiteSlices(
            filteredDetails: details,
            privacyFilter: websitePrivacyFilter,
            fallback: fallback,
            limit: displaySettings.websiteSliceCount
        )
    }

    var websiteURLDetails: [WebsiteUsageURLDetail] {
        guard let stats = model.websiteUsageStatistics else { return [] }
        return StatisticsDisplayHelpers.filteredWebsiteDetails(stats.urlDetails, filter: websitePrivacyFilter)
    }

    var websiteTotalSeconds: Int {
        websiteDomains.reduce(0) { $0 + $1.activeSeconds }
    }

    func websiteSessions(for detail: WebsiteUsageURLDetail) -> [WebsiteUsageSession] {
        guard let stats = model.websiteUsageStatistics else { return [] }
        return StatisticsDisplayHelpers.filteredWebsiteSessions(stats.sessions, filter: websitePrivacyFilter)
            .filter { $0.url == detail.url && $0.hostname == detail.hostname }
    }

    var displaySettings: StatisticsDisplaySettings { model.settingsStore.statisticsDisplaySettings.clamped }
    func isDomainVisible(_ domain: StatisticsDomain) -> Bool {
        displaySettings.visibleDomains.contains(domain.rawValue)
    }
    var chartHeight: CGFloat {
        switch displaySettings.chartDensity {
        case .compact: 120
        case .comfortable: 150
        case .spacious: 190
        }
    }
    var chartTickCount: Int {
        switch displaySettings.chartDensity {
        case .compact: 3
        case .comfortable: 4
        case .spacious: 6
        }
    }

    var highestLevelAttributes: [UserAttribute] {
        model.attributes
            .filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general" }
            .sorted { $0.level == $1.level ? $0.currentXP > $1.currentXP : $0.level > $1.level }
            .prefix(5)
            .map { $0 }
    }


    var refreshButton: some View {
        Button {
            refreshForCurrentRange(force: true)
        } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
        }
        .buttonStyle(iTuSecondaryButtonStyle(height: 34))
        .disabled(model.statisticsLoading || model.usageLoading)
        .keyboardShortcut("r", modifiers: .command)
        .help("Refresh statistics for the selected time range")
    }

    var settingsButton: some View {
        FeatureSettingsButton(label: "Statistics settings") { showingSettings = true }
            .popover(isPresented: $showingSettings, arrowEdge: .top) {
            StatisticsSettingsPopover()
                .environment(model)
        }
    }

    var rangePicker: some View {
        Picker("Time Range", selection: $timeRange) {
            Text("Today").tag("Today")
            Text("7 days").tag("7 Days")
            Text("30 days").tag("30 Days")
            Text("3 months").tag("90 Days")
            Text("1 year").tag("365 Days")
            Text("Custom").tag("Custom")
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 470)
    }

    var customRangeControls: some View {
        Group {
            if timeRange == "Custom" {
                HStack(spacing: 12) {
                    DatePicker("From", selection: customFromDateBinding, in: Self.earliestDate...Date(), displayedComponents: .date)
                    DatePicker("To", selection: customToDateBinding, in: Self.earliestDate...Date(), displayedComponents: .date)
                    Button("Apply Range") { refreshForCurrentRange(force: true) }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .disabled(customFromDate > customToDate)
                }
                .padding(12)
                .iTuPanel(radius: 10)
            }
        }
    }

    var usageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Foreground app activity")
                        .font(.system(size: 16, weight: .semibold))
                    Text(timeRange == "Today" ? "Hourly foreground time, stacked by application." : "Daily foreground time, stacked by application.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                if let stats = model.usageStatistics {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(formatDuration(stats.totalActiveSeconds))
                            .font(.system(size: 16, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.teal)
                        if displaySettings.showEngagement, let engaged = stats.totalEngagedSeconds {
                            Text("Engaged \(formatDuration(engaged))")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                }
            }
            if !model.settingsStore.usagePreferences.enabled {
                Text("Enable foreground usage in Settings to see this report.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            } else if let stats = model.usageStatistics, !stats.daily.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 20) {
                        usageChart(stats)
                        Divider()
                        usageAppList(stats)
                            .frame(width: 240)
                    }
                    VStack(spacing: 18) {
                        usageChart(stats)
                        Divider()
                        usageAppList(stats)
                    }
                }
            } else if model.usageLoading {
                ProgressView("Loading usage…")
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else if let error = model.usageError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
            } else {
                Text("No foreground usage recorded in this period.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 100)
            }
        }
        .padding(20)
        .iTuPanel(radius: 14)
    }

    func usageChart(_ stats: UsageStatistics) -> some View {
        let isHourly = timeRange == "Today"
        return Chart(usageChartItems(stats)) { app in
            BarMark(
                x: .value(isHourly ? "Hour" : "Day", app.localDate),
                y: .value("Active time", app.activeSeconds),
                width: .ratio(0.58),
                stacking: .standard
            )
            .foregroundStyle(usageColor(for: app.bundleId))
            .cornerRadius(2)
        }
        .chartXAxis {
            if isHourly {
                AxisMarks(values: ["00", "04", "08", "12", "16", "20"]) { value in
                    AxisValueLabel {
                        if let bucket = value.as(String.self) {
                            Text("\(bucket):00")
                        }
                    }
                }
            } else {
                AxisMarks(values: .automatic(desiredCount: chartTickCount)) { value in
                    AxisValueLabel {
                        if let bucket = value.as(String.self) {
                            Text(shortDate(bucket))
                        }
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing) { value in
                AxisGridLine().foregroundStyle(iTuTheme.borderSoft)
                AxisValueLabel {
                    if let seconds = value.as(Int.self) { Text(axisDuration(seconds)) }
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: max(150, chartHeight + 50))
        .accessibilityLabel(isHourly ? "Foreground usage by hour and application" : "Foreground usage by day and application")
    }

    var websiteUsageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "globe")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(iTuTheme.teal)
                    Text("Website activity")
                        .font(.system(size: 16, weight: .semibold))
                }
                Spacer()
                Picker("Privacy", selection: websitePrivacyFilterBinding) {
                    ForEach(WebsiteActivityPrivacyFilter.allCases) { filter in
                        Text(filter.title).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 220)
                .accessibilityLabel("Website activity privacy filter")
            }
            Text("Domain totals with URL visits and session times.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
            if model.usageLoading && model.websiteUsageStatistics == nil {
                ProgressView("Loading website activity…")
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else if !websiteDomains.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 20) {
                        websiteDonutChart
                            .frame(width: 250)
                        Divider()
                        websiteDomainList
                            .frame(maxWidth: .infinity)
                    }
                    VStack(spacing: 18) {
                        websiteDonutChart
                        Divider()
                        websiteDomainList
                    }
                }
                if let error = model.websiteUsageError {
                    Label("Server website activity unavailable: \(error)", systemImage: "exclamationmark.triangle")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.coral)
                }
            } else if let error = model.websiteUsageError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                Text("No website activity recorded in this period.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 100)
            }
        }
        .padding(20)
        .iTuPanel(radius: 14)
    }

    var websiteDonutChart: some View {
        ZStack {
            Chart {
                ForEach(Array(websiteDomains.enumerated()), id: \.element.id) { index, domain in
                    SectorMark(
                        angle: .value("Active time", domain.activeSeconds),
                        innerRadius: .ratio(0.58),
                        angularInset: 2
                    )
                    .foregroundStyle(usageColors[index % usageColors.count])
                }
            }
            .chartLegend(.hidden)

            VStack(spacing: 4) {
                Text(formatDuration(websiteTotalSeconds))
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)
                Text("active time")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .frame(height: 250)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Website activity by domain")
        .accessibilityValue("\(formatDuration(websiteTotalSeconds)) active time")
    }

    func usageAppList(_ stats: UsageStatistics) -> some View {
        VStack(spacing: 8) {
            ForEach(stats.topApps.prefix(displaySettings.topAppsCount)) { app in
                HStack(spacing: 10) {
                    UsageApplicationIcon(bundleID: app.bundleId, displayName: app.displayName, tint: usageColor(for: app.bundleId))
                    Text(app.displayName)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                    Spacer()
                    Text(formatDuration(app.activeSeconds))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(minHeight: 36)
                .accessibilityElement(children: .combine)
            }
        }
    }

    func usageChartItems(_ stats: UsageStatistics) -> [UsageChartItem] {
        let visibleBundleIDs = Set(stats.topApps.prefix(displaySettings.topAppsCount).map(\.bundleId))
        if timeRange == "Today" {
            let hourly = stats.hourlyApps ?? []
            let hourlyByBundle = Dictionary(grouping: hourly, by: \.bundleId)
                .mapValues { $0.reduce(0) { $0 + $1.activeSeconds } }
            let dailyByBundle = Dictionary(grouping: stats.dailyApps, by: \.bundleId)
                .mapValues { $0.reduce(0) { $0 + $1.activeSeconds } }
            let hourlyTotal = hourly.reduce(0) { $0 + $1.activeSeconds }
            let legacyTotal = max(0, stats.daily.reduce(0) { $0 + $1.activeSeconds } - hourlyTotal)
            let fallbackHour = Calendar.current.component(.hour, from: Date())
            var items: [UsageChartItem] = []
            for hour in 0..<24 {
                let label = String(format: "%02d", hour)
                var shown = 0
                for app in stats.topApps.prefix(displaySettings.topAppsCount) {
                    let legacySeconds = max(0, (dailyByBundle[app.bundleId] ?? 0) - (hourlyByBundle[app.bundleId] ?? 0))
                    let seconds = (hourly.first { $0.hour == hour && $0.bundleId == app.bundleId }?.activeSeconds ?? 0)
                        + (hour == fallbackHour ? legacySeconds : 0)
                    shown += seconds
                    items.append(UsageChartItem(
                        localDate: label,
                        bundleId: app.bundleId,
                        displayName: app.displayName,
                        activeSeconds: seconds
                    ))
                }
                let total = hourly.filter { $0.hour == hour }.reduce(hour == fallbackHour ? legacyTotal : 0) { $0 + $1.activeSeconds }
                items.append(UsageChartItem(
                    localDate: label,
                    bundleId: "other",
                    displayName: "Other apps",
                    activeSeconds: max(0, total - shown)
                ))
            }
            return items
        }
        let visible = stats.dailyApps.filter { visibleBundleIDs.contains($0.bundleId) }.map {
            UsageChartItem(localDate: $0.localDate, bundleId: $0.bundleId, displayName: $0.displayName, activeSeconds: $0.activeSeconds)
        }
        let shownByDay = Dictionary(grouping: visible, by: \.localDate).mapValues { $0.reduce(0) { $0 + $1.activeSeconds } }
        let other = stats.daily.compactMap { day -> UsageChartItem? in
            let seconds = day.activeSeconds - (shownByDay[day.localDate] ?? 0)
            return seconds > 0
                ? UsageChartItem(localDate: day.localDate, bundleId: "other", displayName: "Other apps", activeSeconds: seconds)
                : nil
        }
        return visible + other
    }

    func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let hours = minutes / 60
        if hours > 0 { return "\(hours)h \(minutes % 60)m" }
        if minutes > 0 { return "\(minutes)m \(seconds % 60)s" }
        return "\(seconds)s"
    }

    var usageColors: [Color] { [iTuTheme.teal, iTuTheme.syncBlue, iTuTheme.amber, iTuTheme.mint, iTuTheme.coral, iTuTheme.gold] }

    func usageColor(for bundleID: String) -> Color {
        if bundleID == "other" { return iTuTheme.inkFaint }
        let index = model.usageStatistics?.topApps.firstIndex { $0.bundleId == bundleID }
            ?? bundleID.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return usageColors[index % usageColors.count]
    }

    func axisDuration(_ seconds: Int) -> String {
        seconds >= 3_600 ? "\(seconds / 3_600)h" : "\(seconds / 60)m"
    }

    func shortDate(_ value: String) -> String {
        guard let date = StatisticsPeriod.date(from: value) else { return value }
        return StatisticsPeriod.calendar.isDateInToday(date) ? "Today" : date.formatted(.dateTime.month(.abbreviated).day())
    }

    var growthTrendItems: [StatisticsTrendPoint] {
        let filtered = (model.growthStatistics?.trend ?? [])
            .filter { timeRange != "Custom" || ($0.date >= customFromKey && $0.date <= customToKey) }
        guard displaySettings.grouping != .day else {
            return filtered.map { StatisticsTrendPoint(id: "xp-\($0.date)", label: $0.date, value: $0.xp) }
        }
        return Dictionary(grouping: filtered) { bucketKey(for: $0.date) }
            .map { key, points in StatisticsTrendPoint(id: "xp-\(key)", label: key, value: points.reduce(0) { $0 + $1.xp }) }
            .sorted { $0.label < $1.label }
    }

}
