import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tone, SectionTitle, EmptyState } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/components/session-gate";
import { isAdmin } from "@/lib/session";
import {
  ClipboardList,
  CalendarDays,
  CircleDashed,
  CheckCircle2,
  Table2,
  UserPlus,
  Upload,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

type InspectorRow = {
  id: number;
  name: string;
  role: string;
  active: number;
  cert: string;
  phone: string;
  sheetId: string;
  sheetName: string;
  total: number;
  thisMonth: number;
  open: number;
  complete: number;
  awaitingExport: number;
};

type RecentRow = {
  id: number;
  jobNumber: string;
  clientName: string;
  propertyCity: string;
  inspectionDate: string;
  status: string;
  ownerName: string;
  lastEditedBy: string;
  lastEditedAt: string;
  exportedAt: string;
  exportedTo: string;
};

type Overview = {
  totals: {
    inspections: number;
    thisMonth: number;
    open: number;
    complete: number;
    unassigned: number;
    awaitingExport: number;
  };
  inspectors: InspectorRow[];
  recent: RecentRow[];
};

type SheetOption = { id: string; name: string; modifiedTime: string };

function Kpi({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: number | string;
  icon: typeof ClipboardList;
  testId: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </Card>
  );
}

export default function Operations() {
  const { user } = useSession();
  const { toast } = useToast();
  const admin = isAdmin(user);
  const [form, setForm] = useState({ name: "", pin: "", cert: "", phone: "" });
  const [me, setMe] = useState({ name: "", pin: "" });

  const { data, isLoading } = useQuery<Overview>({ queryKey: ["/api/overview"] });
  const { data: sheets, isLoading: sheetsLoading } = useQuery<SheetOption[]>({
    queryKey: ["/api/sheets"],
    enabled: admin,
    staleTime: 5 * 60 * 1000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
  };

  const fail = (title: string) => (err: any) =>
    toast({
      title,
      description: String(err?.message ?? "")
        .replace(/^\d{3}:\s*/, "")
        .replace(/^\{"message":"/, "")
        .replace(/"\}$/, ""),
      variant: "destructive",
    });

  const addInspector = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/team", {
        name: form.name.trim(),
        pin: form.pin.trim(),
        cert: form.cert.trim(),
        phone: form.phone.trim(),
      });
    },
    onSuccess: () => {
      setForm({ name: "", pin: "", cert: "", phone: "" });
      refresh();
      toast({ title: "Inspector added" });
    },
    onError: fail("Could not add inspector"),
  });
  const saveMe = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (me.name.trim()) body.name = me.name.trim();
      if (me.pin.trim()) body.pin = me.pin.trim();
      return apiRequest("PATCH", `/api/team/${user?.id}`, body);
    },
    onSuccess: () => {
      setMe({ name: "", pin: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/overview"] });
      toast({ title: "Account updated", description: "Use your new details next time you sign in." });
    },
    onError: (e: any) =>
      toast({ title: "Could not update", description: String(e?.message ?? e), variant: "destructive" }),
  });


  const setSheet = useMutation({
    mutationFn: async (v: { id: number; sheetId: string; sheetName: string }) => {
      await apiRequest("PATCH", `/api/team/${v.id}`, {
        sheetId: v.sheetId,
        sheetName: v.sheetName,
      });
    },
    onSuccess: () => {
      refresh();
      toast({ title: "Sales sheet linked" });
    },
    onError: fail("Could not link that sheet"),
  });

  const toggleActive = useMutation({
    mutationFn: async (v: { id: number; active: boolean }) => {
      await apiRequest("PATCH", `/api/team/${v.id}`, { active: v.active });
    },
    onSuccess: refresh,
    onError: fail("Could not update inspector"),
  });

  const exportRow = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/inspections/${id}/export-sheet`, {});
      return (await res.json()) as { tab: string; row: number; sheetName?: string };
    },
    onSuccess: (r) => {
      refresh();
      toast({
        title: "Sent to sales sheet",
        description: `${r.sheetName ? `${r.sheetName} · ` : ""}${r.tab} tab, row ${r.row}`,
      });
    },
    onError: fail("Not sent"),
  });

  const canAdd = form.name.trim().length > 1 && form.pin.trim().length >= 4;
  const activeInspectors = useMemo(
    () => (data?.inspectors ?? []).filter((i) => i.active),
    [data]
  );

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Skeleton className="mb-4 h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every inspection across the team, plus inspector setup and sales-sheet handoff.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} data-testid="button-refresh">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Link href="/">
            <Button size="sm" variant="secondary" data-testid="button-all-inspections">
              <ClipboardList className="mr-1.5 h-4 w-4" /> Inspections
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Inspections"
          value={data.totals.inspections}
          icon={ClipboardList}
          testId="kpi-total"
        />
        <Kpi
          label="This month"
          value={data.totals.thisMonth}
          icon={CalendarDays}
          testId="kpi-month"
        />
        <Kpi label="In progress" value={data.totals.open} icon={CircleDashed} testId="kpi-open" />
        <Kpi
          label="Not on a sheet"
          value={data.totals.awaitingExport}
          icon={Upload}
          testId="kpi-pending-export"
        />
      </div>

      {/* Inspectors */}
      <Card className="mt-6 p-5">
        <SectionTitle
          title="Inspectors"
          description={
            admin
              ? "Link each inspector to their own sales sheet. Jobs land on the month tab that matches the appointment date."
              : "Your operations manager links each inspector to a sales sheet."
          }
        />

        <div className="mt-4 space-y-3">
          {data.inspectors.map((t) => (
            <div
              key={t.id}
              className="rounded-md border border-border p-3"
              data-testid={`row-inspector-${t.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {t.name}
                    {t.role === "admin" && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Operations manager
                      </span>
                    )}
                    <Tone tone={t.active ? "ok" : "neutral"}>{t.active ? "Active" : "Inactive"}</Tone>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.total} inspections · {t.thisMonth} this month · {t.open} in progress ·{" "}
                    {t.awaitingExport} not on a sheet
                    {t.cert ? ` · ${t.cert}` : ""}
                  </p>
                </div>
                {admin && t.role !== "admin" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })}
                    data-testid={`button-active-${t.id}`}
                  >
                    {t.active ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {admin ? (
                  <Select
                    value={t.sheetId || "none"}
                    onValueChange={(v) =>
                      setSheet.mutate({
                        id: t.id,
                        sheetId: v === "none" ? "" : v,
                        sheetName:
                          v === "none" ? "" : (sheets ?? []).find((s) => s.id === v)?.name ?? "",
                      })
                    }
                  >
                    <SelectTrigger
                      className="h-9 w-full max-w-sm"
                      data-testid={`select-sheet-${t.id}`}
                    >
                      <SelectValue
                        placeholder={sheetsLoading ? "Loading your sheets…" : "No sales sheet linked"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No sales sheet linked</SelectItem>
                      {(sheets ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t.sheetName || "No sales sheet linked"}
                  </span>
                )}
                {t.sheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${t.sheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                    data-testid={`link-sheet-${t.id}`}
                  >
                    Open sheet <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-5" />
        <SectionTitle
          title="Your account"
          description="Change your own display name or PIN. Leave a field blank to keep it as-is."
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              className="mt-1"
              placeholder={user?.name ?? ""}
              value={me.name}
              onChange={(e) => setMe({ ...me, name: e.target.value })}
              data-testid="input-me-name"
            />
          </div>
          <div>
            <Label className="text-xs">New PIN</Label>
            <Input
              className="mt-1"
              inputMode="numeric"
              placeholder="4+ digits"
              value={me.pin}
              onChange={(e) => setMe({ ...me, pin: e.target.value })}
              data-testid="input-me-pin"
            />
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="outline"
              disabled={
                saveMe.isPending ||
                (!me.name.trim() && me.pin.trim().length < 4)
              }
              onClick={() => saveMe.mutate()}
              data-testid="button-save-me"
            >
              {saveMe.isPending ? "Saving…" : "Save account"}
            </Button>
          </div>
        </div>

        {admin && (
          <>
            <Separator className="my-5" />
            <SectionTitle title="Add an inspector" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="input-new-name"
                />
              </div>
              <div>
                <Label className="text-xs">PIN</Label>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  placeholder="4+ digits"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  data-testid="input-new-pin"
                />
              </div>
              <div>
                <Label className="text-xs">Certification</Label>
                <Input
                  className="mt-1"
                  value={form.cert}
                  onChange={(e) => setForm({ ...form, cert: e.target.value })}
                  data-testid="input-new-cert"
                />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input
                  className="mt-1"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  data-testid="input-new-phone"
                />
              </div>
            </div>
            <Button
              className="mt-3"
              size="sm"
              disabled={!canAdd || addInspector.isPending}
              onClick={() => addInspector.mutate()}
              data-testid="button-add-new"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {addInspector.isPending ? "Adding…" : "Add inspector"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {activeInspectors.filter((i) => i.role !== "admin").length} active inspectors.
            </p>
          </>
        )}
      </Card>

      {/* Recent activity + sheet handoff */}
      <Card className="mt-6 p-5">
        <SectionTitle
          title="Recent activity"
          description="Send a job to its inspector's sales sheet — customer, address, city and appointment date only, so your formulas stay untouched."
        />

        {data.recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="No inspections yet"
              description="They appear here as your team creates them."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {data.recent.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                data-testid={`row-recent-${r.id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.clientName || "Unnamed client"}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {r.jobNumber}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.inspectionDate || "No date"}
                    {r.propertyCity ? ` · ${r.propertyCity}` : ""} ·{" "}
                    {r.ownerName || "Unassigned"} · {r.status}
                  </p>
                  {r.exportedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground" data-testid={`text-exported-${r.id}`}>
                      On sheet: {r.exportedTo}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {r.exportedAt ? (
                    <Tone tone="ok">Sent</Tone>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={exportRow.isPending}
                      onClick={() => exportRow.mutate(r.id)}
                      data-testid={`button-export-${r.id}`}
                    >
                      <Upload className="mr-1.5 h-4 w-4" /> Send to sheet
                    </Button>
                  )}
                  <Link href={`/report/${r.id}`}>
                    <Button size="sm" variant="ghost" data-testid={`button-report-${r.id}`}>
                      Report
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
