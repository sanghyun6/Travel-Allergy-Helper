import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { BottomNav } from "@/components/Navigation";
import { StoreProvider, useProfile } from "@/context/store-context";
import { useEffect, type ComponentType } from "react";

import Onboarding from "@/pages/onboarding";
import CameraPage from "@/pages/camera";
import CartPage from "@/pages/cart";
import HistoryPage from "@/pages/history";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { profile, isLoaded } = useProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoaded && !profile) {
      setLocation("/onboarding");
    }
  }, [isLoaded, profile, setLocation]);

  if (!isLoaded) return null;

  return profile ? <Component /> : null;
}

function CameraRoute() { return <ProtectedRoute component={CameraPage} />; }
function CartRoute() { return <ProtectedRoute component={CartPage} />; }
function HistoryRoute() { return <ProtectedRoute component={HistoryPage} />; }
function SettingsRoute() { return <ProtectedRoute component={SettingsPage} />; }

function Router() {
  const { profile, isLoaded } = useProfile();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoaded) return;
    const path = window.location.pathname;
    if (profile && (path === "/" || path === import.meta.env.BASE_URL.replace(/\/$/, ""))) {
      setLocation("/camera");
    } else if (!profile && path !== "/onboarding") {
      setLocation("/onboarding");
    }
  }, [isLoaded, profile, setLocation]);

  return (
    <Switch>
      <Route path="/" component={() => null} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/camera" component={CameraRoute} />
      <Route path="/cart" component={CartRoute} />
      <Route path="/history" component={HistoryRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className="font-sans antialiased text-foreground bg-background h-[100dvh] w-full overflow-hidden flex flex-col items-center">
              <div className="w-full max-w-md h-full relative overflow-y-auto bg-background shadow-2xl sm:border-x">
                <Router />
                <BottomNav />
              </div>
            </div>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default App;
