import UIKit
import WebKit
import Capacitor

/// Custom Capacitor bridge view controller.
///
/// Fixes the black band that appears when the user rubber-band scrolls the
/// WKWebView past the top or bottom edge. Instead of listening for a
/// Capacitor notification (`.capacitorViewDidLoad` is not part of the public
/// API in Capacitor 8), the appearance is applied directly in this subclass
/// once the bridge has created its web view.
class MainViewController: CAPBridgeViewController {

    // Register the app-local Capacitor plugin explicitly.
    // App-target plugins are NOT package auto-registered by Capacitor; without
    // this, registerPlugin("NativeNotification") in TypeScript has no iOS
    // implementation and prayer/events/athkar scheduling silently fails at the
    // bridge while the official LocalNotifications test can still work.
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeNotificationPlugin())
    }

    /// Matches the CSS `--background` token: pure black (dark) / warm off-white (light).
    private static let appBackground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0, green: 0, blue: 0, alpha: 1)
            : UIColor(red: 0.976, green: 0.965, blue: 0.937, alpha: 1)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        applyAppearance()
        // The bridge may finish wiring up the web view after viewDidLoad,
        // so re-apply on the next run loop as well.
        DispatchQueue.main.async { [weak self] in
            self?.applyAppearance()
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        applyAppearance()
    }

    private func applyAppearance() {
        let background = MainViewController.appBackground
        view.backgroundColor = background

        guard let webView = self.webView else { return }
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background

        // No rubber-band overscroll => no exposed background at either edge.
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
    }
}
