import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  Inspection,
  Reading,
  Sample,
  Custody,
  Finding,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  TextField,
  AreaField,
  SelectField,
  FieldRow,
  SectionTitle,
  EmptyState,
  Tone,
} from "@/components/kit";
import {
  dewPointF,
  gpp,
  surfaceRisk,
  moistureStatus,
  sampleVolume,
  num,
  fmt,
} from "@/lib/psych";
import {
  ArrowLeft,
  Camera,
  Droplets,
  FileText,
  FlaskConical,
  Plus,
  Trash2,
  Home,
  Check,
  Beaker,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LabTab } from "@/components/lab-tab";
import { useSession } from "@/components/session-gate";
import { canEdit } from "@/lib/session";
import { Lock, Upload } from "lucide-react";

/* ---------- helpers ---------- */

const CONDITION_OPTIONS = [
  "Condition 1 — Normal fungal ecology",
  "Condition 2 — Settled spores / dust",
  "Condition 3 — Actual fungal growth",
];
const GROWTH_OPTIONS = ["None observed", "Suspect", "Visible growth", "Confirmed by sampling"];
const METER_OPTIONS = ["Pin", "Pinless", "Thermo-hygrometer", "Thermal imaging"];
const SAMPLE_TYPES = [
  "Indoor Air",
  "Outdoor Control",
  "Wall Cavity",
  "Surface Tape Lift",
  "Swab",
  "Bulk / Dust",
];

async function fileToDataUrl(file: File, maxDim = 1400, quality = 0.72) {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function SavedFlag({ saving }: { saving: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="status-save">
      {saving ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Saving…
        </>
      ) : (
        <>
          <Check className="h-3.5 w-3.5" /> Saved
        </>
      )}
    </span>
  );
}

/* ---------- page ---------- */

export default function InspectionPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { toast } = useToast();
  const { user } = useSession();

  const { data: inspection, isLoading } = useQuery<Inspection>({
    queryKey: ["/api/inspections", id],
  });

  const [form, setForm] = useState<Inspection | null>(null);
  useEffect(() => {
    if (inspection && !form) setForm(inspection);
  }, [inspection, form]);

  const patch = useMutation({
    mutationFn: async (data: Partial<Inspection>) => {
      await apiRequest("PATCH", `/api/inspections/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
    },
    onError: (err: any) => {
      if (inspection) setForm(inspection); // discard the rejected edit
      toast({
        title: "Change not saved",
        description:
          String(err?.message ?? "").replace(/^\d{3}:\s*/, "").replace(/^\{"message":"/, "").replace(/"\}$/, "") ||
          "You do not have permission to change this inspection.",
        variant: "destructive",
      });
    },
  });

  const sendToSheet = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inspections/${id}/export-sheet`, {});
      return (await res.json()) as { tab: string; row: number; sheetName?: string };
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/overview"] });
      toast({
        title: "Sent to sales sheet",
        description: `${r.sheetName ? `${r.sheetName} · ` : ""}${r.tab} tab, row ${r.row}`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Not sent",
        description: String(err?.message ?? "")
          .replace(/^\d{3}:\s*/, "")
          .replace(/^\{"message":"/, "")
          .replace(/"\}$/, ""),
        variant: "destructive",
      }),
  });

  const set = (k: keyof Inspection, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const commit = (k: keyof Inspection) => () => {
    if (form) patch.mutate({ [k]: (form as any)[k] } as Partial<Inspection>);
  };
  const setAndSave = (k: keyof Inspection) => (v: string) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    patch.mutate({ [k]: v } as Partial<Inspection>);
  };

  if (isLoading || !form) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const outdoorDew = dewPointF(num(form.outdoorTemp), num(form.outdoorRh));
  const outdoorGpp = gpp(num(form.outdoorTemp), num(form.outdoorRh));
  const readOnly = !canEdit(form as any, user);


  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {form.jobNumber || `#${form.id}`}
            </p>
            <h1 className="text-lg font-semibold tracking-tight" data-testid="text-inspection-title">
              {form.clientName || "Unnamed client"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SavedFlag saving={patch.isPending} />
          {!readOnly && (
            <Button
              variant="secondary"
              size="sm"
              disabled={sendToSheet.isPending}
              onClick={() => sendToSheet.mutate()}
              data-testid="button-send-sheet"
              title="Add customer, address, city and appointment date to the sales sheet"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {form.exportedAt ? "Sent to sheet" : sendToSheet.isPending ? "Sending…" : "Send to sheet"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={readOnly}
            data-testid="button-toggle-status"
            onClick={() =>
              setAndSave("status")(form.status === "Complete" ? "In Progress" : "Complete")
            }
          >
            {form.status === "Complete" ? "Reopen" : "Mark complete"}
          </Button>
          <Link href={`/report/${id}`}>
            <Button size="sm" data-testid="button-view-report">
              <FileText className="mr-1.5 h-4 w-4" />
              Report
            </Button>
          </Link>
        </div>
      </div>

      {readOnly && (
        <div
          className="mb-5 flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          data-testid="banner-readonly"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This inspection belongs to {form.ownerName || "another inspector"}. You can read it and
            print the report, but changes are saved only by {form.ownerName || "the owner"} or an
            admin.
          </span>
        </div>
      )}

      <Tabs defaultValue="property">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
          <TabsTrigger value="property" data-testid="tab-property">
            <Home className="mr-1.5 h-4 w-4" /> Property
          </TabsTrigger>
          <TabsTrigger value="readings" data-testid="tab-readings">
            <Droplets className="mr-1.5 h-4 w-4" /> Readings
          </TabsTrigger>
          <TabsTrigger value="samples" data-testid="tab-samples">
            <FlaskConical className="mr-1.5 h-4 w-4" /> Samples
          </TabsTrigger>
          <TabsTrigger value="lab" data-testid="tab-lab">
            <Beaker className="mr-1.5 h-4 w-4" /> Lab
          </TabsTrigger>
          <TabsTrigger value="findings" data-testid="tab-findings">
            <Camera className="mr-1.5 h-4 w-4" /> Findings
          </TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-summary">
            <FileText className="mr-1.5 h-4 w-4" /> Summary
          </TabsTrigger>
        </TabsList>

        {/* ---------------- PROPERTY ---------------- */}
        <fieldset disabled={readOnly} className="min-w-0">
        <TabsContent value="property" className="mt-5 space-y-5">
          <Card className="p-5">
            <SectionTitle title="Client" />
            <div className="space-y-4">
              <FieldRow>
                <TextField label="Client name" testId="clientName" value={form.clientName} onChange={(v) => set("clientName", v)} onCommit={commit("clientName")} />
                <TextField label="Phone" testId="clientPhone" value={form.clientPhone} onChange={(v) => set("clientPhone", v)} onCommit={commit("clientPhone")} />
              </FieldRow>
              <FieldRow>
                <TextField label="Email" testId="clientEmail" value={form.clientEmail} onChange={(v) => set("clientEmail", v)} onCommit={commit("clientEmail")} />
                <TextField label="Job number" testId="jobNumber" value={form.jobNumber} onChange={(v) => set("jobNumber", v)} onCommit={commit("jobNumber")} />
              </FieldRow>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Property" />
            <div className="space-y-4">
              <TextField label="Address" testId="propertyAddress" value={form.propertyAddress} onChange={(v) => set("propertyAddress", v)} onCommit={commit("propertyAddress")} />
              <FieldRow cols={3}>
                <TextField label="City" testId="propertyCity" value={form.propertyCity} onChange={(v) => set("propertyCity", v)} onCommit={commit("propertyCity")} />
                <TextField label="State" testId="propertyState" value={form.propertyState} onChange={(v) => set("propertyState", v)} onCommit={commit("propertyState")} />
                <TextField label="ZIP" testId="propertyZip" value={form.propertyZip} onChange={(v) => set("propertyZip", v)} onCommit={commit("propertyZip")} />
              </FieldRow>
              <FieldRow cols={3}>
                <SelectField label="Property type" testId="propertyType" value={form.propertyType} onChange={setAndSave("propertyType")} options={["Single Family", "Multi Family", "Condo / Co-op", "Apartment", "Commercial", "Institutional"]} />
                <TextField label="Year built" testId="yearBuilt" value={form.yearBuilt} onChange={(v) => set("yearBuilt", v)} onCommit={commit("yearBuilt")} />
                <TextField label="Square feet" testId="squareFeet" value={form.squareFeet} onChange={(v) => set("squareFeet", v)} onCommit={commit("squareFeet")} />
              </FieldRow>
              <FieldRow>
                <SelectField label="Occupied" testId="occupied" value={form.occupied} onChange={setAndSave("occupied")} options={["Yes", "No", "Partially"]} />
                <TextField label="HVAC type" testId="hvacType" value={form.hvacType} onChange={(v) => set("hvacType", v)} onCommit={commit("hvacType")} placeholder="Forced air, heat pump, baseboard…" />
              </FieldRow>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Scope and history" />
            <div className="space-y-4">
              <FieldRow>
                <SelectField label="Reason for inspection" testId="reasonForInspection" value={form.reasonForInspection} onChange={setAndSave("reasonForInspection")} options={["Mold / IAQ Assessment", "Water Loss Investigation", "Post-Remediation Verification", "Health Complaint", "Real Estate Transaction", "Odor Investigation"]} />
                <TextField label="Scope of work" testId="scope" value={form.scope} onChange={(v) => set("scope", v)} onCommit={commit("scope")} placeholder="Whole house, basement only…" />
              </FieldRow>
              <AreaField label="Occupant concerns / reported symptoms" testId="occupantConcerns" value={form.occupantConcerns} onChange={(v) => set("occupantConcerns", v)} onCommit={commit("occupantConcerns")} />
              <AreaField label="Water intrusion history" testId="waterHistory" value={form.waterHistory} onChange={(v) => set("waterHistory", v)} onCommit={commit("waterHistory")} />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle
              title="Inspector and ambient conditions"
              description="Outdoor baseline is used as the control comparison for interior readings."
            />
            <div className="space-y-4">
              <FieldRow cols={3}>
                <TextField label="Inspector" testId="inspectorName" value={form.inspectorName} onChange={(v) => set("inspectorName", v)} onCommit={commit("inspectorName")} />
                <TextField label="Certification #" testId="inspectorCert" value={form.inspectorCert} onChange={(v) => set("inspectorCert", v)} onCommit={commit("inspectorCert")} placeholder="IICRC AMRT / CMI" />
                <TextField label="Company" testId="companyName" value={form.companyName} onChange={(v) => set("companyName", v)} onCommit={commit("companyName")} />
              </FieldRow>
              <FieldRow cols={4}>
                <TextField label="Inspection date" testId="inspectionDate" type="date" value={form.inspectionDate} onChange={(v) => set("inspectionDate", v)} onCommit={commit("inspectionDate")} />
                <TextField label="Outdoor temp (°F)" testId="outdoorTemp" value={form.outdoorTemp} onChange={(v) => set("outdoorTemp", v)} onCommit={commit("outdoorTemp")} />
                <TextField label="Outdoor RH (%)" testId="outdoorRh" value={form.outdoorRh} onChange={(v) => set("outdoorRh", v)} onCommit={commit("outdoorRh")} />
                <TextField label="Weather" testId="weather" value={form.weather} onChange={(v) => set("weather", v)} onCommit={commit("weather")} placeholder="Clear, rain, humid" />
              </FieldRow>
              <div className="flex flex-wrap gap-4 rounded-md bg-muted/60 px-4 py-3 font-mono text-xs">
                <span data-testid="text-outdoor-dewpoint">Outdoor dew point: {fmt(outdoorDew)} °F</span>
                <span data-testid="text-outdoor-gpp">Outdoor GPP: {fmt(outdoorGpp)}</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ---------------- READINGS ---------------- */}
        <TabsContent value="readings" className="mt-5">
          <ReadingsTab inspectionId={id} outdoorGpp={outdoorGpp} />
        </TabsContent>

        {/* ---------------- SAMPLES ---------------- */}
        <TabsContent value="samples" className="mt-5 space-y-5">
          <SamplesTab inspectionId={id} />
          <CustodyTab inspectionId={id} />
        </TabsContent>

        {/* ---------------- LAB RESULTS ---------------- */}
        <TabsContent value="lab" className="mt-5">
          <LabTab inspectionId={id} />
        </TabsContent>

        {/* ---------------- FINDINGS ---------------- */}
        <TabsContent value="findings" className="mt-5">
          <FindingsTab inspectionId={id} onError={(m) => toast({ title: m, variant: "destructive" })} />
        </TabsContent>

        {/* ---------------- SUMMARY ---------------- */}
        <TabsContent value="summary" className="mt-5">
          <Card className="p-5">
            <SectionTitle title="Conclusions" description="This text appears at the top of the printed report." />
            <div className="space-y-4">
              <AreaField label="Summary of observations" testId="summary" rows={5} value={form.summary} onChange={(v) => set("summary", v)} onCommit={commit("summary")} />
              <AreaField label="Recommendations" testId="recommendations" rows={5} value={form.recommendations} onChange={(v) => set("recommendations", v)} onCommit={commit("recommendations")} />
              <AreaField label="Limitations and disclaimers" testId="limitations" rows={4} value={form.limitations} onChange={(v) => set("limitations", v)} onCommit={commit("limitations")} />
            </div>
          </Card>
        </TabsContent>
        </fieldset>
      </Tabs>
    </div>
  );
}

/* ---------------- Readings ---------------- */

function ReadingsTab({ inspectionId, outdoorGpp }: { inspectionId: number; outdoorGpp: number | null }) {
  const { data: rows, isLoading } = useQuery<Reading[]>({
    queryKey: ["/api/inspections", inspectionId, "readings"],
  });
  const key = ["/api/inspections", inspectionId, "readings"];

  const add = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/inspections/${inspectionId}/readings`, { room: "" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const update = useMutation({
    mutationFn: async ({ rid, data }: { rid: number; data: Partial<Reading> }) => {
      await apiRequest("PATCH", `/api/readings/${rid}`, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (rid: number) => {
      await apiRequest("DELETE", `/api/readings/${rid}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Moisture and thermal readings"
        description="Dew point, GPP, and condensation risk are calculated automatically."
        action={
          <Button size="sm" onClick={() => add.mutate()} data-testid="button-add-reading">
            <Plus className="mr-1.5 h-4 w-4" /> Add reading
          </Button>
        }
      />
      {(rows ?? []).length === 0 ? (
        <EmptyState
          icon={<Droplets className="h-8 w-8" />}
          title="No readings recorded"
          description="Add a row for each room or material you meter."
        />
      ) : (
        <div className="space-y-4">
          {(rows ?? []).map((r) => (
            <ReadingRow
              key={r.id}
              row={r}
              outdoorGpp={outdoorGpp}
              onSave={(data) => update.mutate({ rid: r.id, data })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ReadingRow({
  row,
  outdoorGpp,
  onSave,
  onDelete,
}: {
  row: Reading;
  outdoorGpp: number | null;
  onSave: (data: Partial<Reading>) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState({
    room: row.room,
    material: row.material,
    meterType: row.meterType,
    moisture: row.moisture?.toString() ?? "",
    dryStandard: row.dryStandard?.toString() ?? "",
    tempF: row.tempF?.toString() ?? "",
    rh: row.rh?.toString() ?? "",
    surfaceTempF: row.surfaceTempF?.toString() ?? "",
    notes: row.notes,
  });

  const save = () =>
    onSave({
      room: f.room,
      material: f.material,
      meterType: f.meterType,
      moisture: num(f.moisture),
      dryStandard: num(f.dryStandard),
      tempF: num(f.tempF),
      rh: num(f.rh),
      surfaceTempF: num(f.surfaceTempF),
      notes: f.notes,
    } as Partial<Reading>);

  const dew = dewPointF(num(f.tempF), num(f.rh));
  const g = gpp(num(f.tempF), num(f.rh));
  const risk = surfaceRisk(num(f.surfaceTempF), dew);
  const ms = moistureStatus(num(f.moisture), num(f.dryStandard));
  const delta = g != null && outdoorGpp != null ? g - outdoorGpp : null;

  return (
    <div className="rounded-lg border border-border p-4" data-testid={`row-reading-${row.id}`}>
      <div className="space-y-4">
        <FieldRow cols={3}>
          <TextField label="Room / location" testId={`reading-room-${row.id}`} value={f.room} onChange={(v) => setF({ ...f, room: v })} onCommit={save} placeholder="Basement — north wall" />
          <TextField label="Material" testId={`reading-material-${row.id}`} value={f.material} onChange={(v) => setF({ ...f, material: v })} onCommit={save} placeholder="Drywall, framing, subfloor" />
          <SelectField label="Meter" testId={`reading-meter-${row.id}`} value={f.meterType} onChange={(v) => { setF({ ...f, meterType: v }); onSave({ meterType: v } as Partial<Reading>); }} options={METER_OPTIONS} />
        </FieldRow>
        <FieldRow cols={4}>
          <TextField label="Moisture (%WME)" testId={`reading-moisture-${row.id}`} value={f.moisture} onChange={(v) => setF({ ...f, moisture: v })} onCommit={save} />
          <TextField label="Dry standard (%)" testId={`reading-dry-${row.id}`} value={f.dryStandard} onChange={(v) => setF({ ...f, dryStandard: v })} onCommit={save} />
          <TextField label="Air temp (°F)" testId={`reading-temp-${row.id}`} value={f.tempF} onChange={(v) => setF({ ...f, tempF: v })} onCommit={save} />
          <TextField label="RH (%)" testId={`reading-rh-${row.id}`} value={f.rh} onChange={(v) => setF({ ...f, rh: v })} onCommit={save} />
        </FieldRow>
        <FieldRow cols={2}>
          <TextField label="Surface temp (°F)" testId={`reading-surface-${row.id}`} value={f.surfaceTempF} onChange={(v) => setF({ ...f, surfaceTempF: v })} onCommit={save} hint="Compared against dew point for condensation risk." />
          <TextField label="Notes" testId={`reading-notes-${row.id}`} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} onCommit={save} />
        </FieldRow>
      </div>

      <Separator className="my-4" />
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground" data-testid={`text-reading-dew-${row.id}`}>
          Dew point {fmt(dew)} °F
        </span>
        <span className="font-mono text-xs text-muted-foreground" data-testid={`text-reading-gpp-${row.id}`}>
          GPP {fmt(g)}
        </span>
        {delta != null && (
          <span className="font-mono text-xs text-muted-foreground">
            Δ vs outdoor {delta > 0 ? "+" : ""}
            {fmt(delta)} GPP
          </span>
        )}
        {ms && <Tone tone={ms.tone} testId={`badge-moisture-${row.id}`}>{ms.label}</Tone>}
        {risk && (
          <Tone tone={risk.tone} testId={`badge-risk-${row.id}`}>
            {risk.label} ({fmt(risk.delta)} °F to dew point)
          </Tone>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onDelete} data-testid={`button-delete-reading-${row.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Samples ---------------- */

function SamplesTab({ inspectionId }: { inspectionId: number }) {
  const key = ["/api/inspections", inspectionId, "samples"];
  const { data: rows, isLoading } = useQuery<Sample[]>({ queryKey: key });

  const add = useMutation({
    mutationFn: async () => {
      const n = (rows?.length ?? 0) + 1;
      await apiRequest("POST", `/api/inspections/${inspectionId}/samples`, {
        sampleId: `S-${String(n).padStart(2, "0")}`,
        cassetteType: "Spore Trap",
        calFlowLpm: 15,
        durationMin: 5,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const update = useMutation({
    mutationFn: async ({ sid, data }: { sid: number; data: Partial<Sample> }) => {
      await apiRequest("PATCH", `/api/samples/${sid}`, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (sid: number) => {
      await apiRequest("DELETE", `/api/samples/${sid}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  const hasOutdoor = (rows ?? []).some((s) => s.sampleType === "Outdoor Control");

  return (
    <Card className="p-5">
      <SectionTitle
        title="Air and surface samples"
        description="Air volume is calculated from calibrated flow and run time."
        action={
          <Button size="sm" onClick={() => add.mutate()} data-testid="button-add-sample">
            <Plus className="mr-1.5 h-4 w-4" /> Add sample
          </Button>
        }
      />
      {(rows ?? []).length > 0 && !hasOutdoor && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300" data-testid="alert-no-outdoor">
          No outdoor control sample recorded. Indoor spore counts cannot be interpreted without one.
        </div>
      )}
      {(rows ?? []).length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-8 w-8" />}
          title="No samples collected"
          description="Add each cassette or swab, including an outdoor control."
        />
      ) : (
        <div className="space-y-4">
          {(rows ?? []).map((s) => (
            <SampleRow
              key={s.id}
              row={s}
              onSave={(data) => update.mutate({ sid: s.id, data })}
              onDelete={() => remove.mutate(s.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SampleRow({
  row,
  onSave,
  onDelete,
}: {
  row: Sample;
  onSave: (data: Partial<Sample>) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState({
    sampleId: row.sampleId,
    sampleType: row.sampleType,
    location: row.location,
    cassetteType: row.cassetteType,
    cassetteLot: row.cassetteLot,
    pumpId: row.pumpId,
    calFlowLpm: row.calFlowLpm?.toString() ?? "",
    durationMin: row.durationMin?.toString() ?? "",
    startTime: row.startTime,
    stopTime: row.stopTime,
    analysisRequested: row.analysisRequested,
    notes: row.notes,
  });

  const save = () =>
    onSave({
      ...f,
      calFlowLpm: num(f.calFlowLpm),
      durationMin: num(f.durationMin),
    } as Partial<Sample>);

  const vol = sampleVolume(num(f.calFlowLpm), num(f.durationMin));
  const isAir = ["Indoor Air", "Outdoor Control", "Wall Cavity"].includes(f.sampleType);

  return (
    <div className="rounded-lg border border-border p-4" data-testid={`row-sample-${row.id}`}>
      <div className="space-y-4">
        <FieldRow cols={3}>
          <TextField label="Sample ID" testId={`sample-id-${row.id}`} value={f.sampleId} onChange={(v) => setF({ ...f, sampleId: v })} onCommit={save} />
          <SelectField label="Sample type" testId={`sample-type-${row.id}`} value={f.sampleType} onChange={(v) => { setF({ ...f, sampleType: v }); onSave({ sampleType: v } as Partial<Sample>); }} options={SAMPLE_TYPES} />
          <TextField label="Location" testId={`sample-location-${row.id}`} value={f.location} onChange={(v) => setF({ ...f, location: v })} onCommit={save} placeholder="Center of basement, 4 ft AFF" />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField label="Cassette / media" testId={`sample-cassette-${row.id}`} value={f.cassetteType} onChange={(v) => setF({ ...f, cassetteType: v })} onCommit={save} />
          <TextField label="Lot #" testId={`sample-lot-${row.id}`} value={f.cassetteLot} onChange={(v) => setF({ ...f, cassetteLot: v })} onCommit={save} />
          <TextField label="Pump ID" testId={`sample-pump-${row.id}`} value={f.pumpId} onChange={(v) => setF({ ...f, pumpId: v })} onCommit={save} />
        </FieldRow>
        {isAir && (
          <FieldRow cols={4}>
            <TextField label="Calibrated flow (L/min)" testId={`sample-flow-${row.id}`} value={f.calFlowLpm} onChange={(v) => setF({ ...f, calFlowLpm: v })} onCommit={save} />
            <TextField label="Run time (min)" testId={`sample-duration-${row.id}`} value={f.durationMin} onChange={(v) => setF({ ...f, durationMin: v })} onCommit={save} />
            <TextField label="Start time" testId={`sample-start-${row.id}`} type="time" value={f.startTime} onChange={(v) => setF({ ...f, startTime: v })} onCommit={save} />
            <TextField label="Stop time" testId={`sample-stop-${row.id}`} type="time" value={f.stopTime} onChange={(v) => setF({ ...f, stopTime: v })} onCommit={save} />
          </FieldRow>
        )}
        <FieldRow>
          <TextField label="Analysis requested" testId={`sample-analysis-${row.id}`} value={f.analysisRequested} onChange={(v) => setF({ ...f, analysisRequested: v })} onCommit={save} />
          <TextField label="Notes" testId={`sample-notes-${row.id}`} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} onCommit={save} />
        </FieldRow>
      </div>
      <Separator className="my-4" />
      <div className="flex flex-wrap items-center gap-3">
        {isAir && (
          <span className="font-mono text-xs text-muted-foreground" data-testid={`text-sample-volume-${row.id}`}>
            Volume {fmt(vol, 0)} L{vol != null ? ` (${(vol / 28.3168).toFixed(1)} ft³)` : ""}
          </span>
        )}
        {f.sampleType === "Outdoor Control" && <Tone tone="ok">Control</Tone>}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onDelete} data-testid={`button-delete-sample-${row.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Chain of custody ---------------- */

function CustodyTab({ inspectionId }: { inspectionId: number }) {
  const key = ["/api/inspections", inspectionId, "custody"];
  const { data } = useQuery<Custody>({ queryKey: key });
  const [f, setF] = useState<Custody | null>(null);
  useEffect(() => {
    if (data && !f) setF(data);
  }, [data, f]);

  const patch = useMutation({
    mutationFn: async (d: Partial<Custody>) => {
      await apiRequest("PATCH", `/api/inspections/${inspectionId}/custody`, d);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (!f) return <Skeleton className="h-56 w-full rounded-lg" />;
  const set = (k: keyof Custody) => (v: string) => setF({ ...f, [k]: v } as Custody);
  const commit = (k: keyof Custody) => () => patch.mutate({ [k]: (f as any)[k] } as Partial<Custody>);
  const setAndSave = (k: keyof Custody) => (v: string) => {
    setF({ ...f, [k]: v } as Custody);
    patch.mutate({ [k]: v } as Partial<Custody>);
  };

  return (
    <Card className="p-5">
      <SectionTitle title="Chain of custody" description="Prints as a signed transfer record with the sample table." />
      <div className="space-y-4">
        <FieldRow cols={3}>
          <TextField label="Laboratory" testId="labName" value={f.labName} onChange={set("labName")} onCommit={commit("labName")} />
          <TextField label="Lab contact" testId="labContact" value={f.labContact} onChange={set("labContact")} onCommit={commit("labContact")} />
          <SelectField label="Turnaround" testId="turnaround" value={f.turnaround} onChange={setAndSave("turnaround")} options={["Same day (rush)", "Next day", "Standard (3-5 day)"]} />
        </FieldRow>
        <TextField label="Lab address" testId="labAddress" value={f.labAddress} onChange={set("labAddress")} onCommit={commit("labAddress")} />
        <FieldRow cols={4}>
          <TextField label="Relinquished by" testId="relinquishedBy" value={f.relinquishedBy} onChange={set("relinquishedBy")} onCommit={commit("relinquishedBy")} />
          <TextField label="Date relinquished" testId="relinquishedDate" type="date" value={f.relinquishedDate} onChange={set("relinquishedDate")} onCommit={commit("relinquishedDate")} />
          <TextField label="Ship method" testId="shipMethod" value={f.shipMethod} onChange={set("shipMethod")} onCommit={commit("shipMethod")} placeholder="Hand delivered, FedEx" />
          <TextField label="Tracking #" testId="trackingNumber" value={f.trackingNumber} onChange={set("trackingNumber")} onCommit={commit("trackingNumber")} />
        </FieldRow>
        <FieldRow cols={4}>
          <TextField label="Received by" testId="receivedBy" value={f.receivedBy} onChange={set("receivedBy")} onCommit={commit("receivedBy")} />
          <TextField label="Date received" testId="receivedDate" type="date" value={f.receivedDate} onChange={set("receivedDate")} onCommit={commit("receivedDate")} />
          <SelectField label="Seal intact" testId="sealIntact" value={f.sealIntact} onChange={setAndSave("sealIntact")} options={["Yes", "No", "N/A"]} />
          <TextField label="Cooler temp (°F)" testId="coolerTemp" value={f.coolerTemp} onChange={set("coolerTemp")} onCommit={commit("coolerTemp")} />
        </FieldRow>
        <AreaField label="Remarks" testId="custodyRemarks" value={f.remarks} onChange={set("remarks")} onCommit={commit("remarks")} rows={2} />
      </div>
    </Card>
  );
}

/* ---------------- Findings ---------------- */

function FindingsTab({
  inspectionId,
  onError,
}: {
  inspectionId: number;
  onError: (m: string) => void;
}) {
  const key = ["/api/inspections", inspectionId, "findings"];
  const { data: rows, isLoading } = useQuery<Finding[]>({ queryKey: key });

  const add = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/inspections/${inspectionId}/findings`, {
        conditionClass: CONDITION_OPTIONS[0],
        moldGrowth: "Suspect",
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const update = useMutation({
    mutationFn: async ({ fid, data }: { fid: number; data: Partial<Finding> }) => {
      await apiRequest("PATCH", `/api/findings/${fid}`, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (fid: number) => {
      await apiRequest("DELETE", `/api/findings/${fid}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Visual findings, photos and recommendations"
        description="One entry per affected area. Photos are resized on device before upload."
        action={
          <Button size="sm" onClick={() => add.mutate()} data-testid="button-add-finding">
            <Plus className="mr-1.5 h-4 w-4" /> Add finding
          </Button>
        }
      />
      {(rows ?? []).length === 0 ? (
        <EmptyState
          icon={<Camera className="h-8 w-8" />}
          title="No findings recorded"
          description="Document each area of concern with a photo, condition class, and recommendation."
        />
      ) : (
        <div className="space-y-4">
          {(rows ?? []).map((r) => (
            <FindingRow
              key={r.id}
              row={r}
              onSave={(data) => update.mutate({ fid: r.id, data })}
              onDelete={() => remove.mutate(r.id)}
              onError={onError}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function FindingRow({
  row,
  onSave,
  onDelete,
  onError,
}: {
  row: Finding;
  onSave: (data: Partial<Finding>) => void;
  onDelete: () => void;
  onError: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    room: row.room,
    observation: row.observation,
    affectedMaterial: row.affectedMaterial,
    estimatedArea: row.estimatedArea,
    conditionClass: row.conditionClass,
    moldGrowth: row.moldGrowth,
    moistureSource: row.moistureSource,
    recommendation: row.recommendation,
    photoCaption: row.photoCaption,
  });
  const save = () => onSave(f as Partial<Finding>);

  const onPick = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      onSave({ photo: dataUrl } as Partial<Finding>);
    } catch {
      onError("Could not process that photo");
    } finally {
      setBusy(false);
    }
  };

  const growthTone =
    f.moldGrowth === "None observed" ? "ok" : f.moldGrowth === "Suspect" ? "warn" : "bad";

  return (
    <div className="rounded-lg border border-border p-4" data-testid={`row-finding-${row.id}`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <FieldRow cols={2}>
            <TextField label="Room / area" testId={`finding-room-${row.id}`} value={f.room} onChange={(v) => setF({ ...f, room: v })} onCommit={save} />
            <TextField label="Affected material" testId={`finding-material-${row.id}`} value={f.affectedMaterial} onChange={(v) => setF({ ...f, affectedMaterial: v })} onCommit={save} />
          </FieldRow>
          <AreaField label="Observation" testId={`finding-observation-${row.id}`} value={f.observation} onChange={(v) => setF({ ...f, observation: v })} onCommit={save} rows={3} placeholder="Staining on lower 18 in of drywall behind washer…" />
          <FieldRow cols={2}>
            <SelectField label="Condition class" testId={`finding-condition-${row.id}`} value={f.conditionClass} onChange={(v) => { setF({ ...f, conditionClass: v }); onSave({ conditionClass: v } as Partial<Finding>); }} options={CONDITION_OPTIONS} />
            <SelectField label="Mold growth" testId={`finding-growth-${row.id}`} value={f.moldGrowth} onChange={(v) => { setF({ ...f, moldGrowth: v }); onSave({ moldGrowth: v } as Partial<Finding>); }} options={GROWTH_OPTIONS} />
          </FieldRow>
          <FieldRow cols={2}>
            <TextField label="Estimated area" testId={`finding-area-${row.id}`} value={f.estimatedArea} onChange={(v) => setF({ ...f, estimatedArea: v })} onCommit={save} placeholder="24 sq ft" />
            <TextField label="Moisture source" testId={`finding-source-${row.id}`} value={f.moistureSource} onChange={(v) => setF({ ...f, moistureSource: v })} onCommit={save} placeholder="Supply line leak, condensation" />
          </FieldRow>
          <AreaField label="Recommendation" testId={`finding-recommendation-${row.id}`} value={f.recommendation} onChange={(v) => setF({ ...f, recommendation: v })} onCommit={save} rows={3} />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Photo</p>
          <div className="overflow-hidden rounded-md border border-border bg-muted/40">
            {row.photo ? (
              <img
                src={row.photo}
                alt={f.photoCaption || "Finding photo"}
                className="aspect-[4/3] w-full object-cover"
                data-testid={`img-finding-${row.id}`}
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center text-muted-foreground">
                <Camera className="h-7 w-7" />
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
            data-testid={`input-photo-${row.id}`}
          />
          <div className="mt-2 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              data-testid={`button-photo-${row.id}`}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              {busy ? "Processing…" : row.photo ? "Replace" : "Add photo"}
            </Button>
            {row.photo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSave({ photo: "" } as Partial<Finding>)}
                data-testid={`button-remove-photo-${row.id}`}
                aria-label="Remove photo"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="mt-3">
            <TextField label="Caption" testId={`finding-caption-${row.id}`} value={f.photoCaption} onChange={(v) => setF({ ...f, photoCaption: v })} onCommit={save} />
          </div>
        </div>
      </div>

      <Separator className="my-4" />
      <div className="flex flex-wrap items-center gap-3">
        <Tone tone={growthTone as any} testId={`badge-growth-${row.id}`}>
          {f.moldGrowth}
        </Tone>
        <span className="text-xs text-muted-foreground">{f.conditionClass}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onDelete} data-testid={`button-delete-finding-${row.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
