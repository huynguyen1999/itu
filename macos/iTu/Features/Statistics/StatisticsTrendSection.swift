import Charts
import SwiftUI

struct StatisticsTrendPoint: Identifiable {
    let id: String
    let label: String
    let value: Int
}

struct StatisticsTrendSection: View {
    let calendar: [StudyCalendarDayDTO]
    let growthTrend: [StatisticsTrendPoint]
    let settings: StatisticsDisplaySettings

    private var chartHeight: CGFloat {
        switch settings.chartDensity {
        case .compact: 120
        case .comfortable: 150
        case .spacious: 190
        }
    }

    private var chartTickCount: Int {
        switch settings.chartDensity {
        case .compact: 3
        case .comfortable: 4
        case .spacious: 6
        }
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 14)], spacing: 14) {
            if settings.visibleDomains.contains(StatisticsDomain.productivity.rawValue) {
                trendCard(title: "Task Completion Trend", summary: "\(calendar.reduce(0) { $0 + $1.completedTasks }) completed in this period", values: calendar.map { StatisticsTrendPoint(id: "tasks-\($0.date)", label: $0.date, value: $0.completedTasks) }, valueLabel: "Tasks", color: iTuTheme.teal)
                trendCard(title: "Focus Duration Trend", summary: "\(formatMinutes(calendar.reduce(0) { $0 + $1.focusedMinutes })) across focus sessions", values: calendar.map { StatisticsTrendPoint(id: "focus-\($0.date)", label: $0.date, value: $0.focusedMinutes) }, valueLabel: "Minutes", color: .blue)
            }
            if settings.visibleDomains.contains(StatisticsDomain.growth.rawValue) {
                trendCard(title: "Experience Gained Trend", summary: "\(growthTrend.reduce(0) { $0 + $1.value }) XP earned in this period", values: growthTrend, valueLabel: "XP", color: iTuTheme.amber)
            }
        }
    }

    private func trendCard(title: String, summary: String, values: [StatisticsTrendPoint], valueLabel: String, color: Color) -> some View {
        let chartValues = settings.showZeroValueSeries ? values : values.filter { $0.value > 0 }
        return VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(iTuTheme.ink)
            if settings.showTrendComparison { Text(summary).font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim) }
            if chartValues.contains(where: { $0.value > 0 }) {
                Chart(chartValues) { item in
                    AreaMark(x: .value("Day", item.label), y: .value(valueLabel, item.value)).foregroundStyle(color.opacity(0.16))
                    LineMark(x: .value("Day", item.label), y: .value(valueLabel, item.value)).foregroundStyle(color).lineStyle(.init(lineWidth: 2))
                }
                .chartYAxis { AxisMarks(position: .leading) }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: chartTickCount)) { value in AxisValueLabel { if let label = value.as(String.self) { Text(shortDate(label)) } } } }
                .frame(height: chartHeight)
                .accessibilityLabel("\(title), \(summary)")
            } else {
                Text("No \(valueLabel.lowercased()) recorded in this period.").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).frame(maxWidth: .infinity, minHeight: 150)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .iTuPanel(radius: 14)
    }

    private func formatMinutes(_ minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
    }

    private func shortDate(_ value: String) -> String {
        guard let date = StatisticsPeriod.date(from: value) else { return value }
        return StatisticsPeriod.calendar.isDateInToday(date) ? "Today" : date.formatted(.dateTime.month(.abbreviated).day())
    }
}
