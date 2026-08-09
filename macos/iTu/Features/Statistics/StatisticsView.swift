import Charts
import SwiftUI
import AppKit

struct StatisticsView: View {
    @Environment(AppModel.self) private var model

    @State private var timeRange: String = "30 Days"
    @State private var customFromDate = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customToDate = Date()

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

    private struct WebsiteDomainItem: Identifiable {
        let hostname: String
        let activeSeconds: Int
        var id: String { hostname }
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

    private var selectedRangeLabel: String {
        let from = timeRange == "Custom" ? customFromDate : Calendar.current.date(byAdding: .day, value: -((selectedDayCount ?? 30) - 1), to: Date()) ?? Date()
        let to = timeRange == "Custom" ? customToDate : Date()
        return "\(from.formatted(.dateTime.month(.abbreviated).day())) – \(to.formatted(.dateTime.month(.abbreviated).day().year()))"
    }

    private var websiteDomains: [WebsiteDomainItem] {
        let totals = model.localWebsiteUsageSummaries
            .filter { $0.localDate >= usageFromKey && $0.localDate <= usageToKey }
            .reduce(into: [String: Int]()) { $0[$1.hostname, default: 0] += $1.activeSeconds }
        return totals.map { WebsiteDomainItem(hostname: $0.key, activeSeconds: $0.value) }
            .sorted { $0.activeSeconds == $1.activeSeconds ? $0.hostname < $1.hostname : $0.activeSeconds > $1.activeSeconds }
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
                headerView
                customRangeControls
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
                usageSection
                websiteUsageSection
                trendChartsSection
                attributeDistributionSection
                highestLevelAttributesSection
            }
            .padding(24)
            .frame(maxWidth: 1280)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .onAppear {
            refreshForCurrentRange()
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
                }
            }
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    statisticsHeading
                    Spacer()
                    refreshButton
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
                values: visibleCalendar.map { TrendItem(id: "tasks-\($0.date)", label: $0.date, value: $0.completedTasks) },
                valueLabel: "Tasks",
                color: iTuTheme.teal
            )
            trendCard(
                title: "Focus Duration Trend",
                summary: "\(focusTimeText) across focus sessions",
                values: visibleCalendar.map { TrendItem(id: "focus-\($0.date)", label: $0.date, value: $0.focusedMinutes) },
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
                    Text(formatDuration(stats.totalActiveSeconds))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
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
                AxisMarks(values: .automatic(desiredCount: 6)) { value in
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
        .frame(maxWidth: .infinity, minHeight: 200)
        .accessibilityLabel(isHourly ? "Foreground usage by hour and application" : "Foreground usage by day and application")
    }

    private var websiteUsageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "globe")
                    .foregroundStyle(iTuTheme.teal)
                Text("Website activity")
                    .font(.system(size: 16, weight: .semibold))
            }
            Text("Domain totals from website activity tracked locally on this Mac.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
            if websiteDomains.isEmpty {
                Text(model.settingsStore.usagePreferences.websiteTrackingEnabled
                     ? "No local website activity recorded in this period."
                     : "Enable website tracking in Settings to see this report.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                VStack(spacing: 0) {
                    ForEach(websiteDomains) { domain in
                        HStack(spacing: 12) {
                            Text(String(domain.hostname.first ?? "?"))
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(iTuTheme.teal)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            Text(domain.hostname)
                                .font(.system(size: 12, weight: .medium))
                                .lineLimit(1)
                            Spacer()
                            Text(formatDuration(domain.activeSeconds))
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .padding(.vertical, 8)
                        .overlay(alignment: .bottom) { Divider() }
                    }
                }
            }
        }
        .padding(20)
        .iTuPanel(radius: 14)
    }

    private func usageAppList(_ stats: UsageStatistics) -> some View {
        VStack(spacing: 8) {
            ForEach(stats.topApps.prefix(5)) { app in
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
        let visibleBundleIDs = Set(stats.topApps.prefix(5).map(\.bundleId))
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
                for app in stats.topApps.prefix(5) {
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
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text(summary)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)

            if values.contains(where: { $0.value > 0 }) {
                Chart(values) { item in
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
                    AxisMarks(values: .automatic(desiredCount: 4)) { value in
                        AxisValueLabel {
                            if let label = value.as(String.self) { Text(shortDate(label)) }
                        }
                    }
                }
                .frame(height: 150)
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
        (model.growthStatistics?.trend ?? [])
            .filter { timeRange != "Custom" || ($0.date >= customFromKey && $0.date <= customToKey) }
            .map { TrendItem(id: "xp-\($0.date)", label: $0.date, value: $0.xp) }
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
            StatSummaryTile(title: "App activity", value: model.usageStatistics.map { formatDuration($0.totalActiveSeconds) } ?? (model.usageLoading ? "—" : "0s"), icon: "rectangle.inset.filled", color: iTuTheme.teal)
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
            from = "\(Self.dateKey(fromDate))T00:00:00.000Z"
            to = "\(Self.dateKey(Date()))T00:00:00.000Z"
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
