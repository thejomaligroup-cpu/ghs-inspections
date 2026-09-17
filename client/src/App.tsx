import { useEffect, useState } from "react";
import { Switch, Route, Router, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/kit";
import { Moon, Sun, LogOut, Users } from "lucide-react";
import { SessionGate, useSession } from "@/components/session-gate";
import { isAdmin } from "@/lib/session";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Operations from "@/pages/operations";
import InspectionPage from "@/pages/inspection";
import ReportPage from "@/pages/report";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/operations" component={Operations} />
      <Route path="/inspection/:id" component={InspectionPage} />
      <Route path="/report/:id" component={ReportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Header() {
  const { user, signOut } = useSession();
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
          <Logo className="h-7 w-14" />
          <span className="text-sm font-semibold tracking-tight">Green Home Solutions</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Mold &amp; Air Quality Inspections
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <span
            className="hidden max-w-32 truncate text-xs text-muted-foreground sm:inline"
            data-testid="text-current-user"
          >
            {user?.name}
          </span>
          <Link href="/operations">
            <Button variant="ghost" size="sm" data-testid="button-operations">
              <Users className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">{isAdmin(user) ? "Operations" : "Team"}</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            data-testid="button-signout"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDark(!dark)}
          data-testid="button-theme"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <div className="min-h-screen bg-background text-foreground">
            <SessionGate>
              <Header />
              <AppRouter />
            </SessionGate>
          </div>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
