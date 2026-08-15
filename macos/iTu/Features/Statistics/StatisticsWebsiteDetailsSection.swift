import SwiftUI

extension StatisticsView {
    var websiteDomainList: some View {
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

    func websiteDomainRow(_ domain: StatisticsWebsiteSlice, color: Color) -> some View {
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

    func websitePercent(_ domain: StatisticsWebsiteSlice) -> Int {
        guard websiteTotalSeconds > 0 else { return 0 }
        return Int((Double(domain.activeSeconds) / Double(websiteTotalSeconds) * 100).rounded())
    }

    @ViewBuilder
    func websiteFavicon(_ source: String?, size: CGFloat = 22) -> some View {
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

    func websiteFaviconFallback(size: CGFloat) -> some View {
        Image(systemName: "globe")
            .font(.system(size: size * 0.62))
            .foregroundStyle(iTuTheme.inkDim)
            .frame(width: size, height: size)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }

    var privateBadge: some View {
        Text("Private")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(iTuTheme.coral)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(iTuTheme.coral.opacity(0.12))
            .clipShape(Capsule())
    }

    func sessionStart(_ value: String) -> String { sessionDate(value) }
    func sessionEnd(_ value: String) -> String { sessionDate(value) }

    func sessionDate(_ value: String) -> String {
        guard let date = Self.isoFormatter.date(from: value) ?? Self.isoFormatterNoFraction.date(from: value) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute().second())
    }
}
