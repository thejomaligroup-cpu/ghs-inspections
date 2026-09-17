import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Inspection } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TextField, SelectField, FieldRow, EmptyState, Tone } from "@/components/kit";
import { ClipboardList, Plus, Search, FileText, Trash2, MapPin, Lock, User } from "lucide-react";
import { useSession } from "@/components/session-gate";
import { canEdit } from "@/lib/session";
import { useToast } from "@/hooks/use-toast";

const today = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const { toast } = useToast();
  const { user } = useSession();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    clientName: "",
    propertyAddress: "",
    propertyCity: "",
    propertyState: "NY",
    inspectionDate: today(),
    inspectorName: user?.name ?? "",
    reasonForInspection: "Mold / IAQ Assessment",
  });

  const { data: list, isLoading } = useQuery<Inspection[]>({
    queryKey: ["/api/inspections"],
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/inspections", {
        ...draft,
        jobNumber: `IAQ-${new Date().getFullYear()}-${String(
          (list?.length ?? 0) + 1
        ).padStart(3, "0")}`,
      });
      return (await res.json()) as Inspection;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      setOpen(false);
      toast({ title: "Inspection created", description: created.jobNumber });
      window.location.hash = `#/inspection/${created.id}`;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/inspections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection deleted" });
    },
    onError: (err: any) =>
      toast({
        title: "Not your inspection",
        description:
          String(err?.message ?? "").replace(/^\d{3}:\s*/, "").replace(/^\{.*"message":"/, "").replace(/"\}$/, "") ||
          "Only the owner or an admin can delete it.",
        variant: "destructive",
      }),
  });

  const filtered = useMemo(() => {
    let items = list ?? [];
    if (scope === "mine") items = items.filter((i) => i.ownerId === user?.id);
    if (!q.trim()) return items;
    const t = q.toLowerCase();
    return items.filter((i) =>
      [i.jobNumber, i.clientName, i.propertyAddress, i.propertyCity, i.inspectorName]
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [list, q, scope, user?.id]);

  const openCount = (list ?? []).filter((i) => i.status !== "Complete").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inspections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list?.length ?? 0} total · {openCount} in progress ·{" "}
            {(list ?? []).filter((i) => i.ownerId === user?.id).length} owned by you
          </p>
          <div className="mt-3 inline-flex rounded-md border border-border p-0.5">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                data-testid={`button-scope-${s}`}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  scope === s
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "Whole team" : "Mine"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search job, client, address"
              className="pl-9"
            />
          </div>
          <Button data-testid="button-new-inspection" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title={q ? "No matching inspections" : "No inspections yet"}
          description={
            q
              ? "Try a different job number, client, or address."
              : "Start a new mold and air quality inspection to record readings, samples, and findings in the field."
          }
          action={
            !q && (
              <Button onClick={() => setOpen(true)} data-testid="button-new-inspection-empty">
                <Plus className="mr-1.5 h-4 w-4" />
                New inspection
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <Card
              key={i.id}
              data-testid={`card-inspection-${i.id}`}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    data-testid={`text-job-${i.id}`}
                  >
                    {i.jobNumber || `#${i.id}`}
                  </span>
                  <Tone tone={i.status === "Complete" ? "ok" : "warn"}>{i.status}</Tone>
                </div>
                <p className="mt-1 truncate text-sm font-medium" data-testid={`text-client-${i.id}`}>
                  {i.clientName || "Unnamed client"}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[i.propertyAddress, i.propertyCity, i.propertyState].filter(Boolean).join(", ") ||
                    "No address"}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                  <span>{i.inspectionDate || "No date"}</span>
                  <span aria-hidden>·</span>
                  <span className="flex items-center gap-1" data-testid={`text-owner-${i.id}`}>
                    <User className="h-3 w-3" />
                    {i.ownerId === user?.id ? "You" : i.ownerName || i.inspectorName || "Unassigned"}
                  </span>
                  {!canEdit(i, user) && (
                    <span className="flex items-center gap-1" data-testid={`badge-readonly-${i.id}`}>
                      <Lock className="h-3 w-3" /> View only
                    </span>
                  )}
                  {i.lastEditedBy && i.lastEditedAt && (
                    <span className="hidden sm:inline">
                      · edited by {i.lastEditedBy} {new Date(i.lastEditedAt).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/inspection/${i.id}`}>
                  <Button variant="secondary" size="sm" data-testid={`button-open-${i.id}`}>
                    Open
                  </Button>
                </Link>
                <Link href={`/report/${i.id}`}>
                  <Button variant="outline" size="sm" data-testid={`button-report-${i.id}`}>
                    <FileText className="mr-1.5 h-4 w-4" />
                    Report
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit(i, user)}
                  data-testid={`button-delete-${i.id}`}
                  onClick={() => remove.mutate(i.id)}
                  aria-label="Delete inspection"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New inspection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FieldRow>
              <TextField
                label="Client name"
                testId="new-client"
                value={draft.clientName}
                onChange={(v) => setDraft({ ...draft, clientName: v })}
                placeholder="Jane Doe"
              />
              <TextField
                label="Inspection date"
                testId="new-date"
                type="date"
                value={draft.inspectionDate}
                onChange={(v) => setDraft({ ...draft, inspectionDate: v })}
              />
            </FieldRow>
            <TextField
              label="Property address"
              testId="new-address"
              value={draft.propertyAddress}
              onChange={(v) => setDraft({ ...draft, propertyAddress: v })}
              placeholder="12 Heritage Hills"
            />
            <FieldRow cols={3}>
              <TextField
                label="City"
                testId="new-city"
                value={draft.propertyCity}
                onChange={(v) => setDraft({ ...draft, propertyCity: v })}
              />
              <TextField
                label="State"
                testId="new-state"
                value={draft.propertyState}
                onChange={(v) => setDraft({ ...draft, propertyState: v })}
              />
              <TextField
                label="Inspector"
                testId="new-inspector"
                value={draft.inspectorName}
                onChange={(v) => setDraft({ ...draft, inspectorName: v })}
              />
            </FieldRow>
            <SelectField
              label="Reason for inspection"
              testId="new-reason"
              value={draft.reasonForInspection}
              onChange={(v) => setDraft({ ...draft, reasonForInspection: v })}
              options={[
                "Mold / IAQ Assessment",
                "Water Loss Investigation",
                "Post-Remediation Verification",
                "Health Complaint",
                "Real Estate Transaction",
                "Odor Investigation",
              ]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="button-cancel-new">
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !draft.clientName.trim()}
              data-testid="button-create-inspection"
            >
              {create.isPending ? "Creating…" : "Create inspection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
