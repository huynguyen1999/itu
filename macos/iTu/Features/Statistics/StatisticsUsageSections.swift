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
            if statisticsStore.isRefreshing {
                ProgressView()
                    .controlSize(.small)
            } else {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
        }
        .buttonStyle(iTuSecondaryButtonStyle(height: 34))
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

    var headlineScreenTimeSeconds: Int {
        if let st = model.screenTimeStatistics {
            return st.screenTimeSeconds
        }
        return model.usageStatistics?.totalActiveSeconds ?? 0
    }

    var deviceScopePicker: some View {
        Menu {
            Button {
                model.screenTimeDeviceScope = .all
                Task { await model.refreshUsage(from: usageFromKey, to: usageToKey) }
            } label: {
                HStack {
                    Text("All Devices")
                    if model.screenTimeDeviceScope == .all {
                        Image(systemName: "checkmark")
                    }
                }
            }
            if !model.screenTimeStatus.syncedDevices.isEmpty {
                Divider()
                ForEach(model.screenTimeStatus.syncedDevices, id: \.deviceIdentifier) { device in
                    Button {
                        model.screenTimeDeviceScope = .device(id: device.deviceIdentifier, name: device.displayName)
                        Task { await model.refreshUsage(from: usageFromKey, to: usageToKey) }
                    } label: {
                        HStack {
                            Text(device.displayName)
                            if model.screenTimeDeviceScope.id == device.deviceIdentifier {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: model.screenTimeDeviceScope == .all ? "laptopcomputer.and.iphone" : "macbook.and.iphone")
                    .font(.system(size: 11))
                Text(model.screenTimeDeviceScope.displayName)
                    .font(.system(size: 12, weight: .medium))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(iTuTheme.surfaceMuted)
            .cornerRadius(6)
        }
        .menuStyle(.borderlessButton)
    }

    var screenTimeDiagnosticsButton: some View {
        Button {
            showingDiagnostics = true
        } label: {
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .buttonStyle(.plain)
        .help("Screen Time Diagnostics & Parity Calibrator")
        .popover(isPresented: $showingDiagnostics, arrowEdge: .bottom) {
            ScreenTimeDiagnosticsPopover()
                .environment(model)
        }
    }

    var usageSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text("Screen Time")
                            .font(.system(size: 16, weight: .semibold))
                        deviceScopePicker
                        screenTimeDiagnosticsButton
                    }
                    Text(timeRange == "Today" ? "Hourly Screen Time timeline and application breakdown." : "Daily Screen Time timeline and application breakdown.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                if model.usageStatistics != nil || model.screenTimeStatistics != nil {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(formatDuration(headlineScreenTimeSeconds))
                            .font(.system(size: 16, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.teal)
                        if displaySettings.showEngagement, let engaged = model.usageStatistics?.totalEngagedSeconds {
                            Text("Engaged \(formatDuration(engaged))")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                }
            }
            if !model.settingsStore.usagePreferences.enabled {
                Text("Enable application usage in Settings to see this report.")
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
                Text("No application usage recorded in this period.")
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
        .accessibilityLabel(isHourly ? "Application usage by hour" : "Application usage by day")
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
        let allApps = stats.topApps
        let query = appSearchQuery.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let filteredApps: [UsageTopApp] = query.isEmpty
            ? allApps
            : allApps.filter {
                $0.displayName.lowercased().contains(query) || $0.bundleId.lowercased().contains(query)
            }
        let displayedApps = (isAppListExpanded || !query.isEmpty)
            ? filteredApps
            : Array(filteredApps.prefix(displaySettings.topAppsCount))

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Applications (\(allApps.count))")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
                if allApps.count > displaySettings.topAppsCount {
                    Button {
                        isAppListExpanded.toggle()
                    } label: {
                        HStack(spacing: 3) {
                            Text(isAppListExpanded ? "Top \(displaySettings.topAppsCount)" : "All \(allApps.count)")
                            Image(systemName: isAppListExpanded ? "chevron.up" : "chevron.down")
                        }
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.teal)
                    }
                    .buttonStyle(.plain)
                }
            }

            if isAppListExpanded || allApps.count > 8 {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Search apps…", text: $appSearchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 11))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(iTuTheme.surfaceMuted)
                .cornerRadius(6)
            }

            ScrollView(.vertical, showsIndicators: isAppListExpanded) {
                VStack(spacing: 2) {
                    if displayedApps.isEmpty {
                        Text("No matching applications.")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(displayedApps) { app in
                            Button {
                                selectedAppDetail = app
                            } label: {
                                HStack(spacing: 10) {
                                    UsageApplicationIcon(bundleID: app.bundleId, displayName: app.displayName, tint: usageColor(for: app.bundleId))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(app.displayName)
                                            .font(.system(size: 12, weight: .medium))
                                            .lineLimit(1)
                                        if let engaged = app.engagedSeconds {
                                            Text("Engaged \(formatDuration(engaged))")
                                                .font(.system(size: 10))
                                                .foregroundStyle(iTuTheme.inkDim)
                                        }
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(formatDuration(app.activeSeconds))
                                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                            .foregroundStyle(iTuTheme.ink)
                                        if stats.totalActiveSeconds > 0 {
                                            Text("\(Int(round(Double(app.activeSeconds) / Double(stats.totalActiveSeconds) * 100)))%")
                                                .font(.system(size: 9))
                                                .foregroundStyle(iTuTheme.inkDim)
                                        }
                                    }
                                }
                                .padding(.horizontal, 6)
                                .padding(.vertical, 4)
                                .background(selectedAppDetail?.bundleId == app.bundleId ? iTuTheme.surfaceMuted : Color.clear)
                                .cornerRadius(6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
            .frame(maxHeight: isAppListExpanded ? 240 : nil)
        }
        .popover(item: $selectedAppDetail) { app in
            appDetailPopover(app, stats: stats)
        }
    }

    func appDetailPopover(_ app: UsageTopApp, stats: UsageStatistics) -> some View {
        let percent = stats.totalActiveSeconds > 0
            ? Int(round(Double(app.activeSeconds) / Double(stats.totalActiveSeconds) * 100))
            : 0
        let hourly = (stats.hourlyApps ?? []).filter { $0.bundleId == app.bundleId }
        let daily = stats.dailyApps.filter { $0.bundleId == app.bundleId }
        let showHourly = timeRange == "Today" && !hourly.isEmpty

        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                UsageApplicationIcon(bundleID: app.bundleId, displayName: app.displayName, tint: usageColor(for: app.bundleId))
                VStack(alignment: .leading, spacing: 2) {
                    Text(app.displayName)
                        .font(.system(size: 14, weight: .bold))
                    Text(app.bundleId)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
            }

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Screen Time")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text(formatDuration(app.activeSeconds))
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(iTuTheme.surfaceMuted)
                .cornerRadius(6)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Engaged Time")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text(app.engagedSeconds != nil ? formatDuration(app.engagedSeconds!) : "—")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(iTuTheme.surfaceMuted)
                .cornerRadius(6)

                VStack(alignment: .leading, spacing: 2) {
                    Text("% of Total")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("\(percent)%")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(iTuTheme.surfaceMuted)
                .cornerRadius(6)
            }

            if showHourly {
                Text("Hourly Activity")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)
                Chart(0..<24, id: \.self) { hour in
                    let seconds = hourly.first { $0.hour == hour }?.activeSeconds ?? 0
                    BarMark(
                        x: .value("Hour", String(format: "%02d", hour)),
                        y: .value("Seconds", seconds)
                    )
                    .foregroundStyle(usageColor(for: app.bundleId))
                    .cornerRadius(2)
                }
                .chartXAxis {
                    AxisMarks(values: ["00", "06", "12", "18"]) { value in
                        AxisValueLabel {
                            if let h = value.as(String.self) {
                                Text("\(h):00")
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .trailing) { value in
                        AxisValueLabel {
                            if let s = value.as(Int.self) { Text(axisDuration(s)) }
                        }
                    }
                }
                .frame(height: 110)
            } else if !daily.isEmpty {
                Text("Daily Activity")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)
                ScrollView(.vertical) {
                    VStack(spacing: 4) {
                        ForEach(daily, id: \.localDate) { d in
                            HStack {
                                Text(d.localDate)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                                Spacer()
                                Text(formatDuration(d.activeSeconds))
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                        }
                    }
                }
                .frame(maxHeight: 110)
            }
        }
        .padding(16)
        .frame(width: 320)
    }

    func usageChartItems(_ stats: UsageStatistics) -> [UsageChartItem] {
        let visibleBundleIDs = Set(stats.topApps.prefix(displaySettings.topAppsCount).map(\.bundleId))
        if timeRange == "Today" {
            let hourly = stats.hourlyApps ?? []
            var items: [UsageChartItem] = []
            for hour in 0..<24 {
                let label = String(format: "%02d", hour)
                var shown = 0
                for app in stats.topApps.prefix(displaySettings.topAppsCount) {
                    let seconds = hourly.first { $0.hour == hour && $0.bundleId == app.bundleId }?.activeSeconds ?? 0
                    shown += seconds
                    items.append(UsageChartItem(
                        localDate: label,
                        bundleId: app.bundleId,
                        displayName: app.displayName,
                        activeSeconds: seconds
                    ))
                }
                let total = hourly.filter { $0.hour == hour }.reduce(0) { $0 + $1.activeSeconds }
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

struct ScreenTimeDiagnosticsPopover: View {
    @Environment(AppModel.self) var model
    @State private var appleReportedMinutes: String = ""
    @State private var comparisonResult: String?
    @State private var isRebuilding = false
    @State private var showConfirmRebuild = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Screen Time Diagnostics", systemImage: "waveform.path.ecg")
                    .font(.system(size: 14, weight: .bold))
                Spacer()
                Text("V\(model.screenTimeStatus.normalizationVersion)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(iTuTheme.teal.opacity(0.15))
                    .foregroundStyle(iTuTheme.teal)
                    .cornerRadius(4)
            }

            VStack(spacing: 7) {
                diagnosticRow(
                    label: "Full Disk Access",
                    value: model.screenTimeStatus.fullDiskAccessGranted ? "Granted" : "Missing",
                    color: model.screenTimeStatus.fullDiskAccessGranted ? iTuTheme.mint : iTuTheme.coral
                )
                diagnosticRow(
                    label: "Synced Devices",
                    value: "\(model.screenTimeStatus.syncedDevices.count) discovered"
                )
                diagnosticRow(
                    label: "Deduplicated Events",
                    value: "\(model.screenTimeStatus.duplicatesDroppedCount) dropped"
                )
                diagnosticRow(
                    label: "Stray Boundaries",
                    value: "\(model.screenTimeStatus.strayEventsCount) cleaned"
                )
                diagnosticRow(
                    label: "Pending Uploads",
                    value: "\(model.screenTimeStatus.pendingUploadCount)"
                )
                if !model.screenTimeStatus.openForegroundApps.isEmpty {
                    diagnosticRow(
                        label: "Open Foreground",
                        value: model.screenTimeStatus.openForegroundApps.joined(separator: ", ")
                    )
                }
                if let lastScan = model.screenTimeStatus.lastScanAt {
                    diagnosticRow(
                        label: "Last Scan",
                        value: lastScan.formatted(.dateTime.hour().minute().second())
                    )
                }
                if let lastRecord = model.screenTimeStatus.lastRecordAt {
                    diagnosticRow(
                        label: "Stream Watermark",
                        value: lastRecord.formatted(.dateTime.month().day().hour().minute())
                    )
                }
            }
            .padding(10)
            .background(iTuTheme.surface)
            .cornerRadius(8)

            // Apple Parity Calibrator
            VStack(alignment: .leading, spacing: 6) {
                Text("Apple Parity Calibrator")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack(spacing: 8) {
                    TextField("Apple mins today", text: $appleReportedMinutes)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 130)

                    Button("Compare") {
                        if let mins = Int(appleReportedMinutes) {
                            let ituMins = (model.screenTimeStatistics?.screenTimeSeconds ?? model.usageStatistics?.totalActiveSeconds ?? 0) / 60
                            let diff = ituMins - mins
                            let pct = mins > 0 ? Double(diff) / Double(mins) * 100 : 0
                            comparisonResult = "iTu: \(ituMins)m vs Apple: \(mins)m (diff: \(diff >= 0 ? "+" : "")\(diff)m, \(String(format: "%.1f", pct))%)"
                        }
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 26))
                }

                if let comparisonResult {
                    Text(comparisonResult)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                }
            }

            Divider()

            // Actions
            HStack(spacing: 8) {
                Button("Scan Now") {
                    Task { await model.runScreenTimeImport() }
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 28))

                Button("Re-import 7D") {
                    Task { await model.reimportScreenTimeLast7Days() }
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 28))

                Button("Rebuild All") {
                    showConfirmRebuild = true
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                .foregroundStyle(iTuTheme.coral)
            }
        }
        .padding(16)
        .frame(width: 360)
        .confirmationDialog(
            "Rebuild Screen Time History?",
            isPresented: $showConfirmRebuild,
            titleVisibility: .visible
        ) {
            Button("Rebuild All History (Wipe & Rescan)", role: .destructive) {
                Task {
                    isRebuilding = true
                    await model.rebuildAllScreenTimeBiomeHistory()
                    isRebuilding = false
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will wipe previous local outbox intervals, reset cursors to the beginning of retained Biome history, and perform a full deterministic scan.")
        }
    }

    private func diagnosticRow(label: String, value: String, color: Color = iTuTheme.ink) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
            Spacer()
            Text(value)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(color)
        }
    }
}
