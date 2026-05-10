import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.replit.allergyscanner",
  appName: "Allergy Travel Scanner",
  webDir: "dist",
  // Keep the WebView under the iOS status bar so env(safe-area-inset-top)
  // returns the real Dynamic Island / notch height. If iOS shifts the
  // WebView down for us, the inset is 0 and our CSS padding has no effect.
  ios: {
    contentInset: "never",
    backgroundColor: "#ffffff",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#ffffff",
  },
  plugins: {
    StatusBar: {
      // Translucent so the WebView paints under the status bar, then our
      // CSS padding-top: env(safe-area-inset-top) reserves space for it.
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },
    Camera: {
      // No-op stub — settings are configured via Info.plist on iOS.
    },
  },
};

export default config;
