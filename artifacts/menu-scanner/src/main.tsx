import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import App from "./App";
import "./index.css";

// On native iOS/Android, draw the WebView under the status bar so the CSS
// `env(safe-area-inset-top)` insets resolve to a non-zero value. Without
// this the WebView is shifted down by iOS, the inset is reported as 0, and
// the Dynamic Island still overlaps content.
if (Capacitor.isNativePlatform()) {
  void (async () => {
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Dark });
    } catch {
      // Plugin not available on this platform — safe to ignore.
    }
  })();
}

createRoot(document.getElementById("root")!).render(<App />);
