import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSession, setSession, type SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoFull } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

type Ctx = {
  user: SessionUser | null;
  signOut: () => void;
};
const SessionContext = createContext<Ctx>({ user: null, signOut: () => {} });
export const useSession = () => useContext(SessionContext);

type TeamState = { needsSetup: boolean; names: string[] };

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => getSession());
  const { toast } = useToast();

  const { data: state, isLoading } = useQuery<TeamState>({
    queryKey: ["/api/team/state"],
  });

  const signOut = useCallback(() => {
    setSession(null);
    setUser(null);
    queryClient.clear();
  }, []);

  // Drop a stale local session if the account was removed or deactivated.
  useEffect(() => {
    if (!user) return;
    apiRequest("GET", "/api/auth/me").catch(() => {
      setSession(null);
      setUser(null);
    });
  }, [user?.id]);

  const accept = (u: SessionUser) => {
    setSession(u);
    setUser(u);
    queryClient.invalidateQueries();
  };

  const login = useMutation({
    mutationFn: async (vars: { name: string; pin: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", vars);
      return (await res.json()) as SessionUser;
    },
    onSuccess: accept,
    onError: () =>
      toast({
        title: "Sign-in failed",
        description: "That name and PIN don't match an active inspector.",
        variant: "destructive",
      }),
  });

  const setup = useMutation({
    mutationFn: async (vars: { name: string; pin: string; cert: string }) => {
      const res = await apiRequest("POST", "/api/auth/setup", vars);
      return (await res.json()) as SessionUser;
    },
    onSuccess: (u) => {
      accept(u);
      queryClient.invalidateQueries({ queryKey: ["/api/team/state"] });
      toast({
        title: `Welcome, ${u.name}`,
        description: "You're the admin. Add your inspectors from the Team button in the header.",
      });
    },
    onError: () =>
      toast({ title: "Setup failed", description: "Check the name and PIN.", variant: "destructive" }),
  });

  if (user) {
    return (
      <SessionContext.Provider value={{ user, signOut }}>{children}</SessionContext.Provider>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const first = state?.needsSetup ?? false;

  return (
    <SignInScreen
      first={first}
      knownNames={state?.names ?? []}
      pending={login.isPending || setup.isPending}
      onSubmit={(name, pin, cert) =>
        first ? setup.mutate({ name, pin, cert }) : login.mutate({ name, pin })
      }
    />
  );
}

function SignInScreen({
  first,
  knownNames,
  pending,
  onSubmit,
}: {
  first: boolean;
  knownNames: string[];
  pending: boolean;
  onSubmit: (name: string, pin: string, cert: string) => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [cert, setCert] = useState("");
  const ready = name.trim().length >= 2 && pin.trim().length >= 4;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md items-center px-4">
      <Card className="w-full p-7">
        <div className="mb-6">
          <LogoFull className="mb-4 h-20" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {first ? "Set up your team" : "Sign in"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {first
                ? "Create the first account. You'll be the admin and can add your inspectors next."
                : "Your inspections stay yours to edit. The whole team can view and print any report."}
            </p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !pending) onSubmit(name.trim(), pin.trim(), cert.trim());
          }}
        >
          <div>
            <Label htmlFor="signin-name" className="text-xs font-medium text-muted-foreground">
              Inspector name
            </Label>
            <Input
              id="signin-name"
              list="known-inspectors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Mali"
              autoComplete="username"
              className="mt-1.5"
              data-testid="input-signin-name"
            />
            {!first && (
              <datalist id="known-inspectors">
                {knownNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
          </div>
          <div>
            <Label htmlFor="signin-pin" className="text-xs font-medium text-muted-foreground">
              PIN
            </Label>
            <Input
              id="signin-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="At least 4 digits"
              autoComplete="current-password"
              className="mt-1.5 font-mono"
              data-testid="input-signin-pin"
            />
          </div>
          {first && (
            <div>
              <Label htmlFor="signin-cert" className="text-xs font-medium text-muted-foreground">
                Certification (optional)
              </Label>
              <Input
                id="signin-cert"
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                placeholder="IICRC AMRT / MRS"
                className="mt-1.5"
                data-testid="input-signin-cert"
              />
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={!ready || pending}
            data-testid="button-signin"
          >
            {pending ? "Working…" : first ? "Create admin account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Each inspector signs in with their own name and PIN. Every report stays visible to the whole team.
        </p>
      </Card>
    </main>
  );
}
