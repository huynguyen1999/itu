import SwiftUI

public enum IOSSpacing {
    /// 4pt - Micro adjustments, tightly bound icon/label pairs
    public static let micro: CGFloat = 4
    /// 8pt - Tight element spacing, chips, compact margins
    public static let tight: CGFloat = 8
    /// 12pt - Compact group spacing, list item internal padding
    public static let compact: CGFloat = 12
    /// 16pt - Standard content padding, card padding, horizontal gutters
    public static let normal: CGFloat = 16
    /// 20pt - Section separation, prominent card internal spacing
    public static let section: CGFloat = 20
    /// 24pt - Major block spacing, hero card padding
    public static let major: CGFloat = 24
    /// 32pt - Page break spacing, bottom safe area clearances
    public static let pageBreak: CGFloat = 32
}

public enum IOSCornerRadius {
    /// 10pt - Chips, small buttons, segmented controls
    public static let control: CGFloat = 10
    /// 14pt - List rows, compact cards, accessory items
    public static let row: CGFloat = 14
    /// 18pt - Standard cards, modals, sheets
    public static let card: CGFloat = 18
    /// 24pt - Hero surfaces, large feature cards
    public static let hero: CGFloat = 24
}

public enum IOSMetrics {
    /// 56pt - Standard left navigation rail width
    public static let railWidth: CGFloat = 56
    /// 44pt - Minimum interactive hit target for iOS accessibility
    public static let minimumHitTarget: CGFloat = 44
    /// 40pt - Standard navigation rail item dimension
    public static let railItemSize: CGFloat = 40
}
