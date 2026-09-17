import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tone } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/components/session-gate";
import { isAdmin } from "@/lib/session";
import { Users, UserPlus } from "lucide-react";

type Member = {
  id: number;
  name: string;
  role: string;
  cert: string;
  phone: string;
  active: number;
};

export function TeamDialog() {
  const { user } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", pin: "", cert: "", phone: "" });
  const admin = isAdmin(user);

  const { data: team } = useQuery<Member[]>({ queryKey: ["/api/team"], enabled: open });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team/state"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/team", form);
      return await res.json();
    },
    onSuccess: (m: Member) => {
      refresh();
      setForm({ name: "", pin: "", cert: "", phone: "" });
      toast({
        title: `${m.name} added`,
        description: "Share the link and their PIN — they sign in once per device.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Could not add inspector",
        description: String(err?.message ?? "").replace(/^\d{3}:\s*/, "") || "Check the details.",
        variant: "destructive",
      }),
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/team/${id}`, data);
    },
    onSuccess: refresh,
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const ready = form.name.trim().length >= 2 && form.pin.trim().length >= 4;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="button-team">
          <Users className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Team</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Team</DialogTitle>
          <DialogDescription>
            Every inspector sees all reports. Only the owner of an inspection — or an admin — can
            change it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(team ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              data-testid={`row-team-${m.id}`}
            >
              <div>
                <p className="text-sm font-medium">
                  {m.name}
                  {m.id === user?.id && (
                    <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[m.role === "admin" ? "Admin" : "Inspector", m.cert, m.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.active ? <Tone tone="ok">Active</Tone> : <Tone tone="neutral">Inactive</Tone>}
                {admin && m.id !== user?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update.mutate({ id: m.id, data: { active: !m.active } })}
                    data-testid={`button-toggle-${m.id}`}
                  >
                    {m.active ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {admin && (
          <>
            <Separator className="my-2" />
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !add.isPending) add.mutate();
              }}
            >
              <p className="text-sm font-medium">Add an inspector</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1.5"
                    data-testid="input-team-name"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">PIN</Label>
                  <Input
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    inputMode="numeric"
                    placeholder="4+ digits"
                    className="mt-1.5 font-mono"
                    data-testid="input-team-pin"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Certification
                  </Label>
                  <Input
                    value={form.cert}
                    onChange={(e) => setForm({ ...form, cert: e.target.value })}
                    className="mt-1.5"
                    data-testid="input-team-cert"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1.5"
                    data-testid="input-team-phone"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={!ready || add.isPending}
                data-testid="button-add-inspector"
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                {add.isPending ? "Adding…" : "Add inspector"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
