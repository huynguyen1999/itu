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
    @Environment(AppModel.self) private var model

    @State private var timeRange: String = "30 Days"
    @State private var customFromDate = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customToDate = Date()
    @State private var showingSettings = false
    @State private var websitePrivacyFilter: WebsiteActivityPrivacyFilter = .all

    private struct TrendItem: Identifiable {
        let id: String
        let label: String
        let value: Int
    }

    private struct UsageChartItem: Identifiable {
        let localDate: String
        let bundleId: String
        let displayName: String
        let activeSeconds: Int
        var id: String { "\(localDate)|\(bundleId)" }
    }

    private var selectedDayCount: Int? {
        switch timeRange {
        case "Today": 1
        case "7 Days": 7
        case "30 Days": 30
        case "90 Days": 90
        case "365 Days": 365
        default: 365
        }
    }

    private var customFromKey: String { Self.dateKey(customFromDate) }
    private var customToKey: String { Self.dateKey(customToDate) }

    private var visibleCalendar: [StudyCalendarDayDTO] {
        guard timeRange == "Custom" else { return model.statisticsCalendar }
        return model.statisticsCalendar.filter { $0.date >= customFromKey && $0.date <= customToKey }
    }

    private var trendCalendar: [StudyCalendarDayDTO] {
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

    private func bucketKey(for value: String) -> String {
        guard let date = Self.dayFormatter.date(from: value) else { return value }
        let calendar = Calendar.current
        let bucket: Date
        switch displaySettings.grouping {
        case .day:
            bucket = date
        case .week:
            bucket = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
        case .month:
            bucket = calendar.dateInterval(of: .month, for: date)?.start ?? date
        }
        return Self.dateKey(bucket)
    }

    private var selectedRangeLabel: String {
        let from = timeRange == "Custom" ? customFromDate : Calendar.current.date(byAdding: .day, value: -((selectedDayCount ?? 30) - 1), to: Date()) ?? Date()
        let to = timeRange == "Custom" ? customToDate : Date()
        return "\(from.formatted(.dateTime.month(.abbreviated).day())) – \(to.formatted(.dateTime.month(.abbreviated).day().year()))"
    }

    private var websiteDomains: [StatisticsWebsiteSlice] {
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

    private var websiteURLDetails: [WebsiteUsageURLDetail] {
        guard let stats = model.websiteUsageStatistics else { return [] }
        return StatisticsDisplayHelpers.filteredWebsiteDetails(stats.urlDetails, filter: websitePrivacyFilter)
    }

    private var websiteTotalSeconds: Int {
        websiteDomains.reduce(0) { $0 + $1.activeSeconds }
    }

    private func websiteSessions(for detail: WebsiteUsageURLDetail) -> [WebsiteUsageSession] {
        guard let stats = model.websiteUsageStatistics else { return [] }
        return StatisticsDisplayHelpers.filteredWebsiteSessions(stats.sessions, filter: websitePrivacyFilter)
            .filter { $0.url == detail.url && $0.hostname == detail.hostname }
    }

    private var displaySettings: StatisticsDisplaySettings { model.settingsStore.statisticsDisplaySettings.clamped }
    private var chartHeight: CGFloat {
        switch displaySettings.chartDensity {
        case .compact: 120
        case .comfortable: 150
        case .spacious: 190
        }
    }
    private var chartTickCount: Int {
        switch displaySettings.chartDensity {
        case .compact: 3
        case .comfortable: 4
        case .spacious: 6
        }
    }

    private var highestLevelAttributes: [UserAttribute] {
        model.attributes
            .filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general" }
            .sorted { $0.level == $1.level ? $0.currentXP > $1.currentXP : $0.level > $1.level }
            .prefix(5)
            .map { $0 }
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
                summaryStatsGrid
                if displaySettings.showAppUsage { usageSection }
                if displaySettings.showWebsiteUsage { websiteUsageSection }
                trendChartsSection
                attributeDistributionSection
                highestLevelAttributesSection
                if !displaySettings.showAppUsage && !displaySettings.showWebsiteUsage {
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
            VStack(alignment: .leading, spacing: 14) {
                headerView
                customRangeControls
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .background(iTuTheme.canvas)
        .onAppear {
            if timeRange == displaySettings.defaultRange {
                refreshForCurrentRange()
            } else {
                timeRange = displaySettings.defaultRange
            }
        }
        .onChange(of: timeRange) { _, _ in
            if timeRange != "Custom" { refreshForCurrentRange() }
        }
    }

    private var headerView: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top) {
                statisticsHeading
                Spacer()
                HStack(spacing: 10) {
                    rangePicker
                    refreshButton
                    settingsButton
                }
            }
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    statisticsHeading
                    Spacer()
                    HStack(spacing: 10) {
                        refreshButton
                        settingsButton
                    }
                }
                rangePicker
            }
        }
    }

    private var refreshButton: some View {
        Button {
            refreshForCurrentRange()
        } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
        }
        .buttonStyle(iTuSecondaryButtonStyle(height: 34))
        .disabled(model.statisticsLoading || model.usageLoading)
        .keyboardShortcut("r", modifiers: .command)
        .help("Refresh statistics for the selected time range")
    }

    private var settingsButton: some View {
        FeatureSettingsButton(label: "Statistics settings") { showingSettings = true }
            .popover(isPresented: $showingSettings, arrowEdge: .top) {
            StatisticsSettingsPopover()
                .environment(model)
        }
    }

    private var statisticsHeading: some View {
        VStack(alignment: .leading, spacing: 6) {
            iTuSectionLabel(title: "ANALYTICS", color: iTuTheme.teal)
            Text("Statistics")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
            Text("Tasks, deep work, learning, and Growth progress for \(selectedRangeLabel).")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    private var rangePicker: some View {
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

    private var customRangeControls: some View {
        Group {
            if timeRange == "Custom" {
                HStack(spacing: 12) {
                    DatePicker("From", selection: $customFromDate, in: Self.earliestDate...Date(), displayedComponents: .date)
                    DatePicker("To", selection: $customToDate, in: Self.earliestDate...Date(), displayedComponents: .date)
                    Button("Apply Range") { refreshForCurrentRange() }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .disabled(customFromDate > customToDate)
                }
                .padding(12)
                .iTuPanel(radius: 10)
            }
        }
    }

    private var trendChartsSection: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 14)], spacing: 14) {
            trendCard(
                title: "Task Completion Trend",
                summary: "\(completedTasksCount) completed in this period",
                values: trendCalendar.map { TrendItem(id: "tasks-\($0.date)", label: $0.date, value: $0.completedTasks) },
                valueLabel: "Tasks",
                color: iTuTheme.teal
            )
            trendCard(
                title: "Focus Duration Trend",
                summary: "\(focusTimeText) across focus sessions",
                values: trendCalendar.map { TrendItem(id: "focus-\($0.date)", label: $0.date, value: $0.focusedMinutes) },
                valueLabel: "Minutes",
                color: Color.blue
            )
            trendCard(
                title: "Experience Gained Trend",
                summary: "\(model.growthStatistics?.totalXp ?? 0) XP earned in this period",
                values: growthTrendItems,
                valueLabel: "XP",
                color: iTuTheme.amber
            )
        }
    }

    private var usageSection: some View {
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

    private func usageChart(_ stats: UsageStatistics) -> some View {
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

    private var websiteUsageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "globe")
                        .foregroundStyle(iTuTheme.teal)
                    Text("Website activity")
                        .font(.system(size: 16, weight: .semibold))
                }
                Spacer()
                Picker("Privacy", selection: $websitePrivacyFilter) {
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

    private var websiteDonutChart: some View {
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

    private var websiteDomainList: some View {
        VStack(spacing: 0) {
            ForEach(Array(websiteDomains.enumerated()), id: \.element.id) { index, domain in
                if domain.hostname == "Other" {
                    websiteDomainRow(domain, color: usageColors[index % usageColors.count])
                } else {
                    DisclosureGroup {
                        let details = websiteURLDetails.filter { $0.hostname == domain.hostname }
                        if details.isEmpty {
                            Text("No URL details available for this domain.")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                                .padding(.vertical, 8)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(details) { detail in
                                    DisclosureGroup {
                                        let sessions = websiteSessions(for: detail)
                                        if sessions.isEmpty {
                                            Text("No session visits available.")
                                                .font(.system(size: 11))
                                                .foregroundStyle(iTuTheme.inkDim)
                                                .padding(.vertical, 6)
                                        } else {
                                            VStack(spacing: 6) {
                                                ForEach(sessions) { session in
                                                    HStack(alignment: .top, spacing: 8) {
                                                        VStack(alignment: .leading, spacing: 2) {
                                                            Text("\(sessionStart(session.startedAt)) – \(sessionEnd(session.endedAt))")
                                                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                                            Text("Visit \(formatDuration(session.activeSeconds))")
                                                                .font(.system(size: 10))
                                                                .foregroundStyle(iTuTheme.inkDim)
                                                        }
                                                        Spacer()
                                                        if session.isPrivate { privateBadge }
                                                    }
                                                    .padding(.vertical, 4)
                                                }
                                            }
                                            .padding(.leading, 12)
                                        }
                                    } label: {
                                        HStack(spacing: 8) {
                                            websiteFavicon(detail.iconUrl)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(StatisticsDisplayHelpers.websiteTitle(detail))
                                                    .font(.system(size: 12, weight: .medium))
                                                    .lineLimit(1)
                                                Text(detail.url)
                                                    .font(.system(size: 10))
                                                    .foregroundStyle(iTuTheme.inkDim)
                                                    .lineLimit(1)
                                            }
                                            Spacer()
                                            Text(formatDuration(detail.activeSeconds))
                                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                                .foregroundStyle(iTuTheme.inkDim)
                                            Text("\(websiteSessions(for: detail).count) visits")
                                                .font(.system(size: 10))
                                                .foregroundStyle(iTuTheme.inkDim)
                                            if detail.isPrivate { privateBadge }
                                        }
                                    }
                                    .padding(.vertical, 6)
                                    .overlay(alignment: .bottom) { Divider() }
                                }
                            }
                            .padding(.leading, 12)
                        }
                    } label: {
                        websiteDomainRow(domain, color: usageColors[index % usageColors.count])
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Divider() }
                }
            }
        }
    }

    private func websiteDomainRow(_ domain: StatisticsWebsiteSlice, color: Color) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(color)
                .frame(width: 12, height: 12)
            Text(domain.hostname)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
            Spacer()
            Text("\(websitePercent(domain))% · \(formatDuration(domain.activeSeconds))")
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    private func websitePercent(_ domain: StatisticsWebsiteSlice) -> Int {
        guard websiteTotalSeconds > 0 else { return 0 }
        return Int((Double(domain.activeSeconds) / Double(websiteTotalSeconds) * 100).rounded())
    }

    @ViewBuilder
    private func websiteFavicon(_ source: String?, size: CGFloat = 22) -> some View {
        if let source, let url = URL(string: source), ["http", "https"].contains(url.scheme?.lowercased()) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    websiteFaviconFallback(size: size)
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        } else {
            websiteFaviconFallback(size: size)
        }
    }

    private func websiteFaviconFallback(size: CGFloat) -> some View {
        Image(systemName: "globe")
            .font(.system(size: size * 0.62))
            .foregroundStyle(iTuTheme.inkDim)
            .frame(width: size, height: size)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    private var privateBadge: some View {
        Text("Private")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(iTuTheme.coral)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(iTuTheme.coral.opacity(0.12))
            .clipShape(Capsule())
    }

    private func sessionStart(_ value: String) -> String { sessionDate(value) }
    private func sessionEnd(_ value: String) -> String { sessionDate(value) }

    private func sessionDate(_ value: String) -> String {
        guard let date = Self.isoFormatter.date(from: value) ?? Self.isoFormatterNoFraction.date(from: value) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute().second())
    }

    private func usageAppList(_ stats: UsageStatistics) -> some View {
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

    private func usageChartItems(_ stats: UsageStatistics) -> [UsageChartItem] {
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

    private func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let hours = minutes / 60
        if hours > 0 { return "\(hours)h \(minutes % 60)m" }
        if minutes > 0 { return "\(minutes)m \(seconds % 60)s" }
        return "\(seconds)s"
    }

    private let usageColors = [iTuTheme.teal, iTuTheme.syncBlue, iTuTheme.amber, iTuTheme.mint, iTuTheme.coral, iTuTheme.gold]

    private func usageColor(for bundleID: String) -> Color {
        if bundleID == "other" { return iTuTheme.inkFaint }
        let index = model.usageStatistics?.topApps.firstIndex { $0.bundleId == bundleID }
            ?? bundleID.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return usageColors[index % usageColors.count]
    }

    private func axisDuration(_ seconds: Int) -> String {
        seconds >= 3_600 ? "\(seconds / 3_600)h" : "\(seconds / 60)m"
    }

    private func shortDate(_ value: String) -> String {
        guard let date = Self.dayFormatter.date(from: value) else { return value }
        return Calendar.current.isDateInToday(date) ? "Today" : date.formatted(.dateTime.month(.abbreviated).day())
    }

    private func trendCard(
        title: String,
        summary: String,
        values: [TrendItem],
        valueLabel: String,
        color: Color
    ) -> some View {
        let chartValues = displaySettings.showZeroValueSeries ? values : values.filter { $0.value > 0 }
        return VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            if displaySettings.showTrendComparison {
                Text(summary)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if chartValues.contains(where: { $0.value > 0 }) {
                Chart(chartValues) { item in
                    AreaMark(
                        x: .value("Day", item.label),
                        y: .value(valueLabel, item.value)
                    )
                    .foregroundStyle(color.opacity(0.16))
                    LineMark(
                        x: .value("Day", item.label),
                        y: .value(valueLabel, item.value)
                    )
                    .foregroundStyle(color)
                    .lineStyle(.init(lineWidth: 2))
                }
                .chartYAxis { AxisMarks(position: .leading) }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: chartTickCount)) { value in
                        AxisValueLabel {
                            if let label = value.as(String.self) { Text(shortDate(label)) }
                        }
                    }
                }
                .frame(height: chartHeight)
                .accessibilityLabel("\(title), \(summary)")
            } else {
                Text("No \(valueLabel.lowercased()) recorded in this period.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 150)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .iTuPanel(radius: 14)
    }

    private var growthTrendItems: [TrendItem] {
        let filtered = (model.growthStatistics?.trend ?? [])
            .filter { timeRange != "Custom" || ($0.date >= customFromKey && $0.date <= customToKey) }
        guard displaySettings.grouping != .day else {
            return filtered.map { TrendItem(id: "xp-\($0.date)", label: $0.date, value: $0.xp) }
        }
        return Dictionary(grouping: filtered) { bucketKey(for: $0.date) }
            .map { key, points in TrendItem(id: "xp-\(key)", label: key, value: points.reduce(0) { $0 + $1.xp }) }
            .sorted { $0.label < $1.label }
    }

    private var attributeDistributionSection: some View {
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

    private var highestLevelAttributesSection: some View {
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

    private var completedTasksCount: Int {
        visibleCalendar.reduce(0) { $0 + $1.completedTasks }
    }

    private var habitCompletedCount: Int {
        visibleCalendar.reduce(0) { $0 + $1.sessions }
    }

    private var habitScoreText: String {
        "\(habitCompletedCount)"
    }

    private var focusMinsTotal: Int {
        visibleCalendar.reduce(0) { $0 + $1.focusedMinutes }
    }

    private var focusTimeText: String {
        let mins = focusMinsTotal
        guard mins > 0 else { return "0m" }
        let hours = mins / 60
        let remainingMins = mins % 60
        if hours > 0 {
            return "\(hours)h \(remainingMins)m"
        }
        return "\(remainingMins)m"
    }

    private var summaryStatsGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
            StatSummaryTile(title: "Tasks completed", value: calendarStatisticValue("\(completedTasksCount)"), icon: "checkmark.circle.fill", color: iTuTheme.mint)
            StatSummaryTile(title: "Focus sessions", value: calendarStatisticValue("\(visibleCalendar.reduce(0) { $0 + $1.focusSessions })"), icon: "timer", color: iTuTheme.teal)
            StatSummaryTile(title: "Focus duration", value: calendarStatisticValue(focusTimeText), icon: "clock", color: iTuTheme.teal)
            StatSummaryTile(title: "XP gained", value: growthStatisticValue("\(model.growthStatistics?.totalXp ?? 0)"), icon: "bolt.fill", color: iTuTheme.amber)
            StatSummaryTile(title: "Review sessions", value: calendarStatisticValue("\(visibleCalendar.reduce(0) { $0 + $1.sessions })"), icon: "book.closed", color: iTuTheme.amber)
            StatSummaryTile(title: "Cards reviewed", value: calendarStatisticValue("\(visibleCalendar.reduce(0) { $0 + $1.reviews })"), icon: "rectangle.stack", color: iTuTheme.coral)
            StatSummaryTile(title: "Cards created", value: calendarStatisticValue("\(visibleCalendar.reduce(0) { $0 + $1.cardsCreated })"), icon: "plus.circle", color: iTuTheme.mint)
            if displaySettings.showAppUsage {
                StatSummaryTile(title: "App activity", value: model.usageStatistics.map { formatDuration($0.totalActiveSeconds) } ?? (model.usageLoading ? "—" : "0s"), icon: "rectangle.inset.filled", color: iTuTheme.teal)
            }
        }
    }

    private func calendarStatisticValue(_ value: String) -> String {
        if model.statisticsLoading && model.statisticsCalendar.isEmpty { return "—" }
        if model.statisticsCalendarError { return "Unavailable" }
        return value
    }

    private func growthStatisticValue(_ value: String) -> String {
        if model.statisticsLoading && model.growthStatistics == nil { return "—" }
        if model.growthStatisticsError { return "Unavailable" }
        return value
    }

    private func refreshForCurrentRange() {
        let days = selectedDayCount ?? 365
        let from: String
        let to: String
        let usageFrom: String
        let usageTo: String
        if timeRange == "Custom" {
            from = "\(customFromKey)T00:00:00.000Z"
            let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: customToDate) ?? customToDate
            to = "\(Self.dateKey(nextDay))T00:00:00.000Z"
            usageFrom = customFromKey
            usageTo = customToKey
        } else {
            let fromDate = Calendar.current.date(byAdding: .day, value: -(days - 1), to: Date()) ?? Date()
            let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
            from = "\(Self.dateKey(fromDate))T00:00:00.000Z"
            to = "\(Self.dateKey(nextDay))T00:00:00.000Z"
            usageFrom = Self.dateKey(fromDate)
            usageTo = Self.dateKey(Date())
        }
        Task {
            await model.refreshStatistics(calendarDays: days, fromDate: from, toDate: to)
            await model.refreshUsage(from: usageFrom, to: usageTo)
        }
    }

    private var usageFromKey: String {
        guard timeRange != "Custom" else { return customFromKey }
        let days = selectedDayCount ?? 365
        return Self.dateKey(Calendar.current.date(byAdding: .day, value: -(days - 1), to: Date()) ?? Date())
    }

    private var usageToKey: String {
        timeRange == "Custom" ? customToKey : Self.dateKey(Date())
    }

    private static var earliestDate: Date {
        Calendar.current.date(byAdding: .day, value: -364, to: Date()) ?? Date()
    }

    private static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoFormatterNoFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

private struct StatSummaryTile: View {
    let title: String
    let value: String
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
            }
            Spacer()
        }
        .padding(12)
        .iTuPanel(radius: 12)
    }
}

private struct UsageApplicationIcon: View {
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

private struct StatisticsSettingsPopover: View {
    @Environment(AppModel.self) private var model
    @State private var loginItemError: String?
    @State private var excludedBundleIDsDraft = ""
    @State private var excludedBundleIDsEditing = false
    @State private var excludedBundleIDsError: String?

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
                Toggle("Pause tracking (this device)", isOn: Binding(
                    get: { settings.usagePreferences.paused },
                    set: { settings.usagePreferences.paused = $0 }
                ))
                FeatureSettingsRow(label: "Idle threshold") {
                    Stepper(value: Binding(
                        get: { settings.usagePreferences.idleThresholdSeconds },
                        set: { settings.usagePreferences.idleThresholdSeconds = min(1800, max(60, $0)) }
                    ), in: 60...1800, step: 30) {
                        Text("\(settings.usagePreferences.idleThresholdSeconds)s")
                            .font(.system(size: 11, design: .monospaced))
                    }
                    .accessibilityLabel("Idle threshold")
                }
                FeatureSettingsRow(label: "Retention") {
                    Stepper(value: Binding(
                        get: { settings.usagePreferences.retentionDays },
                        set: { settings.usagePreferences.retentionDays = min(365, max(7, $0)) }
                    ), in: 7...365, step: 7) { Text("\(settings.usagePreferences.retentionDays)d") }
                    .accessibilityLabel("Retention days")
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text("Excluded bundle IDs")
                        .font(.system(size: 12))
                    TextField("com.example.App, …", text: Binding(
                        get: { excludedBundleIDsDraft },
                        set: {
                            excludedBundleIDsDraft = $0
                            excludedBundleIDsEditing = true
                            excludedBundleIDsError = parseExcludedBundleIDs().error
                        }
                    ))
                    .textFieldStyle(.roundedBorder)
                    HStack {
                        if let excludedBundleIDsError {
                            Text(excludedBundleIDsError)
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.coral)
                        }
                        Spacer()
                        Button("Apply") { applyExcludedBundleIDs(settings.usagePreferences) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .disabled(!canApplyExcludedBundleIDs(settings.usagePreferences))
                    }
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
        .onAppear { syncExcludedBundleIDs(settings.usagePreferences) }
        .onChange(of: settings.usagePreferences.excludedBundleIds) { _, _ in
            if !excludedBundleIDsEditing { syncExcludedBundleIDs(settings.usagePreferences) }
        }
    }

    private func syncExcludedBundleIDs(_ preferences: UsagePreferences) {
        excludedBundleIDsDraft = preferences.excludedBundleIds.joined(separator: ", ")
        excludedBundleIDsEditing = false
        excludedBundleIDsError = nil
    }

    private func normalizedExcludedBundleIDs() -> [String]? {
        let result = parseExcludedBundleIDs()
        excludedBundleIDsError = result.error
        return result.ids
    }

    private func parseExcludedBundleIDs() -> (ids: [String]?, error: String?) {
        let ids = excludedBundleIDsDraft
            .split(separator: ",", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var seen = Set<String>()
        let unique = ids.filter { seen.insert($0).inserted }
        guard unique.count <= 100 else {
            return (nil, "Use at most 100 bundle IDs.")
        }
        guard unique.allSatisfy({ $0.count <= 255 }) else {
            return (nil, "Each bundle ID must be 255 characters or fewer.")
        }
        return (unique, nil)
    }

    private func canApplyExcludedBundleIDs(_ preferences: UsagePreferences) -> Bool {
        guard let ids = parseExcludedBundleIDs().ids else { return false }
        return excludedBundleIDsEditing && ids != preferences.excludedBundleIds
    }

    private func applyExcludedBundleIDs(_ preferences: UsagePreferences) {
        guard let ids = normalizedExcludedBundleIDs() else { return }
        model.settingsStore.usagePreferences.excludedBundleIds = ids
        excludedBundleIDsDraft = ids.joined(separator: ", ")
        excludedBundleIDsEditing = false
    }
}
