import SwiftUI

public struct IOSNavigationDirtyPreferenceKey: PreferenceKey {
    public static var defaultValue: Set<IOSDestination> { [] }
    public static func reduce(value: inout Set<IOSDestination>, nextValue: () -> Set<IOSDestination>) {
        value.formUnion(nextValue())
    }
}
