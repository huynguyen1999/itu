import SwiftUI

public enum IOSTypography {
    public static let largeTitle = Font.largeTitle.bold()
    public static let title = Font.title2.bold()
    public static let headline = Font.headline.weight(.semibold)
    public static let subheadline = Font.subheadline
    public static let body = Font.body
    public static let callout = Font.callout
    public static let caption = Font.caption
    public static let captionBold = Font.caption.weight(.semibold)
    public static let kicker = Font.caption2.weight(.bold)
    public static let metric = Font.system(.title2, design: .rounded).weight(.bold)
    public static let mono = Font.system(.subheadline, design: .monospaced)
}
