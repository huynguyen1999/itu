import Charts
import SwiftUI

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

    private var selectedDayCount: Int? {
        switch timeRange {
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerView
                customRangeControls
                if model.statisticsError {
                    Label("Some statistics could not be loaded.", systemImage: "exclamationmark.triangle")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.coral)
                }
                summaryStatsGrid
                trendChartsSection
                attributeDistributionSection
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .onAppear { refreshForCurrentRange() }
        .onChange(of: timeRange) { _, _ in
            if timeRange != "Custom" { refreshForCurrentRange() }
        }
    }

    private var headerView: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top) {
                statisticsHeading
                Spacer()
                rangePicker
            }
            VStack(alignment: .leading, spacing: 14) {
                statisticsHeading
                rangePicker
            }
        }
    }

    private var statisticsHeading: some View {
        VStack(alignment: .leading, spacing: 6) {
            iTuSectionLabel(title: "ANALYTICS", color: iTuTheme.teal)
            Text("Statistics & Reports")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
            Text("Productivity trends, focus duration, and habit consistency.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    private var rangePicker: some View {
        Picker("Time Range", selection: $timeRange) {
            Text("7 Days").tag("7 Days")
            Text("30 Days").tag("30 Days")
            Text("90 Days").tag("90 Days")
            Text("365 Days").tag("365 Days")
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
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) }
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

            if model.statisticsLoading {
                ProgressView("Loading statistics…")
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else if model.statisticsError {
                unavailableStatisticsState
            } else if let attributes = model.growthStatistics?.attributes, !attributes.isEmpty {
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
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 12) {
            StatSummaryTile(title: "Tasks Completed", value: statisticValue("\(completedTasksCount)"), icon: "checkmark.circle.fill", color: iTuTheme.mint)
            StatSummaryTile(title: "Focus Sessions", value: statisticValue("\(visibleCalendar.reduce(0) { $0 + $1.focusSessions })"), icon: "timer", color: iTuTheme.teal)
            StatSummaryTile(title: "Focus Duration", value: statisticValue(focusTimeText), icon: "clock", color: iTuTheme.teal)
            StatSummaryTile(title: "XP Gained", value: statisticValue("\(model.growthStatistics?.totalXp ?? 0)"), icon: "bolt.fill", color: iTuTheme.amber)
            StatSummaryTile(title: "Review Sessions", value: statisticValue("\(visibleCalendar.reduce(0) { $0 + $1.sessions })"), icon: "book.closed", color: iTuTheme.amber)
            StatSummaryTile(title: "Cards Reviewed", value: statisticValue("\(visibleCalendar.reduce(0) { $0 + $1.reviews })"), icon: "rectangle.stack", color: iTuTheme.coral)
            StatSummaryTile(title: "Cards Created", value: statisticValue("\(visibleCalendar.reduce(0) { $0 + $1.cardsCreated })"), icon: "plus.circle", color: iTuTheme.mint)
        }
    }

    private func statisticValue(_ value: String) -> String {
        if model.statisticsLoading { return "—" }
        if model.statisticsError { return "Unavailable" }
        return value
    }

    private func refreshForCurrentRange() {
        let days = selectedDayCount ?? 365
        let from: String
        let to: String
        if timeRange == "Custom" {
            from = "\(customFromKey)T00:00:00.000Z"
            let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: customToDate) ?? customToDate
            to = "\(Self.dateKey(nextDay))T00:00:00.000Z"
        } else {
            let fromDate = Calendar.current.date(byAdding: .day, value: -(days - 1), to: Date()) ?? Date()
            from = "\(Self.dateKey(fromDate))T00:00:00.000Z"
            to = "\(Self.dateKey(Date()))T00:00:00.000Z"
        }
        Task { await model.refreshStatistics(calendarDays: days, fromDate: from, toDate: to) }
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
