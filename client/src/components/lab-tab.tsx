import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Sample, LabResult } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TextField,
  FieldRow,
  SectionTitle,
  EmptyState,
  Tone,
} from "@/components/kit";
import { num, fmt, sampleVolume } from "@/lib/psych";
import {
  ORGANISM_PRESETS,
  AIR_TYPES,
  perM3,
  buildComparison,
  fmtCount,
} from "@/lib/lab";
import { FlaskConical, Plus, Trash2, Beaker, Wand2 } from "lucide-react";
import { LabUpload } from "@/components/lab-upload";
import { useState } from "react";

const STARTER_PANEL = [
  "Aspergillus/Penicillium",
  "Cladosporium",
  "Basidiospores",
  "Ascospores",
  "Alternaria",
  "Stachybotrys",
  "Chaetomium",
];

export function LabTab({ inspectionId }: { inspectionId: number }) {
  const sampleKey = ["/api/inspections", inspectionId, "samples"];
  const labKey = ["/api/inspections", inspectionId, "lab-results"];
  const { data: samples, isLoading: loadingSamples } = useQuery<Sample[]>({
    queryKey: sampleKey,
  });
  const { data: results, isLoading: loadingResults } = useQuery<LabResult[]>({
    queryKey: labKey,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: labKey });

  const addRow = useMutation({
    mutationFn: async ({ sampleRowId, organism }: { sampleRowId: number; organism: string }) => {
      await apiRequest("POST", `/api/inspections/${inspectionId}/lab-results`, {
        sampleRowId,
        organism,
      });
    },
    onSuccess: invalidate,
  });
  const addPanel = useMutation({
    mutationFn: async (sampleRowId: number) => {
      for (const organism of STARTER_PANEL) {
        await apiRequest("POST", `/api/inspections/${inspectionId}/lab-results`, {
          sampleRowId,
          organism,
        });
      }
    },
    onSuccess: invalidate,
  });
  const updateRow = useMutation({
    mutationFn: async ({ lid, data }: { lid: number; data: Partial<LabResult> }) => {
      await apiRequest("PATCH", `/api/lab-results/${lid}`, data);
    },
    onSuccess: invalidate,
  });
  const deleteRow = useMutation({
    mutationFn: async (lid: number) => {
      await apiRequest("DELETE", `/api/lab-results/${lid}`);
    },
    onSuccess: invalidate,
  });
  const updateSample = useMutation({
    mutationFn: async ({ sid, data }: { sid: number; data: Partial<Sample> }) => {
      await apiRequest("PATCH", `/api/samples/${sid}`, data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sampleKey }),
  });

  if (loadingSamples || loadingResults) return <Skeleton className="h-72 w-full rounded-lg" />;

  const all = samples ?? [];
  if (all.length === 0) {
    return (
      <Card className="p-5">
        <SectionTitle title="Lab results" />
        <EmptyState
          icon={<Beaker className="h-8 w-8" />}
          title="No samples to report on"
          description="Add samples on the Samples tab first, then enter the spore counts the lab returns for each one."
        />
      </Card>
    );
  }

  const comparison = buildComparison(all, results ?? []);

  return (
    <div className="space-y-5">
      <LabUpload inspectionId={inspectionId} samples={all} />

      {/* Interpretation */}
      <Card className="p-5">
        <SectionTitle
          title="Indoor vs. outdoor comparison"
          description="Counts are normalised to spores per cubic metre and compared against the outdoor control."
        />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tone tone={comparison.verdict.tone} testId="badge-verdict">
            {comparison.verdict.label}
          </Tone>
          <span className="font-mono text-xs text-muted-foreground" data-testid="text-totals">
            Indoor {fmtCount(comparison.indoorTotal)} /m³ · Outdoor{" "}
            {fmtCount(comparison.outdoorTotal)} /m³
            {comparison.totalRatio != null ? ` · ratio ${comparison.totalRatio.toFixed(2)}x` : ""}
          </span>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">{comparison.verdict.detail}</p>

        {comparison.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Organism</th>
                  <th className="py-2 pr-3 font-medium">Indoor /m³</th>
                  <th className="py-2 pr-3 font-medium">Outdoor /m³</th>
                  <th className="py-2 pr-3 font-medium">I/O ratio</th>
                  <th className="py-2 font-medium">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((r) => (
                  <tr
                    key={r.organism}
                    className="border-b border-border/60"
                    data-testid={`row-comparison-${r.organism}`}
                  >
                    <td className="py-2 pr-3">
                      {r.organism}
                      {r.marker && (
                        <span className="ml-1.5 text-[10px] uppercase text-amber-700 dark:text-amber-400">
                          marker
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">{fmtCount(r.indoor)}</td>
                    <td className="py-2 pr-3 font-mono">{fmtCount(r.outdoor)}</td>
                    <td className="py-2 pr-3 font-mono">
                      {r.ratio == null ? "n/a" : `${r.ratio.toFixed(1)}x`}
                    </td>
                    <td className="py-2">
                      <Tone tone={r.tone}>{r.label}</Tone>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Marker taxa are genera generally associated with water-damaged building materials.
              Ratios are a screening aid — interpret them together with your moisture readings and
              visual findings.
            </p>
          </div>
        )}
      </Card>

      {/* Per-sample entry */}
      {all.map((s) => (
        <SampleResults
          key={`${s.id}-${s.labReportNo}-${s.dateAnalyzed}-${s.analyst}-${s.resultNotes}`}
          sample={s}
          rows={(results ?? []).filter((r) => r.sampleRowId === s.id)}
          onAddRow={(organism) => addRow.mutate({ sampleRowId: s.id, organism })}
          onAddPanel={() => addPanel.mutate(s.id)}
          panelPending={addPanel.isPending}
          onUpdateRow={(lid, data) => updateRow.mutate({ lid, data })}
          onDeleteRow={(lid) => deleteRow.mutate(lid)}
          onUpdateSample={(data) => updateSample.mutate({ sid: s.id, data })}
        />
      ))}
    </div>
  );
}

function SampleResults({
  sample,
  rows,
  onAddRow,
  onAddPanel,
  panelPending,
  onUpdateRow,
  onDeleteRow,
  onUpdateSample,
}: {
  sample: Sample;
  rows: LabResult[];
  onAddRow: (organism: string) => void;
  onAddPanel: () => void;
  panelPending: boolean;
  onUpdateRow: (lid: number, data: Partial<LabResult>) => void;
  onDeleteRow: (lid: number) => void;
  onUpdateSample: (data: Partial<Sample>) => void;
}) {
  const [meta, setMeta] = useState({
    labReportNo: sample.labReportNo,
    dateAnalyzed: sample.dateAnalyzed,
    analyst: sample.analyst,
    resultNotes: sample.resultNotes,
  });
  const vol = sampleVolume(sample.calFlowLpm, sample.durationMin);
  const isAir = AIR_TYPES.includes(sample.sampleType);
  const total = rows.reduce((sum, r) => {
    if (r.organism.trim() === "Total spores") return sum;
    const v = perM3(r, sample);
    return v == null ? sum : sum + v;
  }, 0);

  return (
    <Card className="p-5" data-testid={`card-lab-sample-${sample.id}`}>
      <SectionTitle
        title={`${sample.sampleId || `Sample ${sample.id}`} — ${sample.sampleType}`}
        description={
          [
            sample.location,
            isAir && vol ? `${fmt(vol, 0)} L sampled` : null,
            sample.cassetteType,
          ]
            .filter(Boolean)
            .join(" · ") || "No collection details recorded"
        }
        action={
          <div className="flex gap-2">
            {rows.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAddPanel}
                disabled={panelPending}
                data-testid={`button-add-panel-${sample.id}`}
              >
                <Wand2 className="mr-1.5 h-4 w-4" />
                {panelPending ? "Adding…" : "Common panel"}
              </Button>
            )}
            <Button size="sm" onClick={() => onAddRow("")} data-testid={`button-add-lab-row-${sample.id}`}>
              <Plus className="mr-1.5 h-4 w-4" /> Add taxon
            </Button>
          </div>
        }
      />

      <div className="mb-5 space-y-4">
        <FieldRow cols={3}>
          <TextField
            label="Lab report #"
            testId={`labReportNo-${sample.id}`}
            value={meta.labReportNo}
            onChange={(v) => setMeta({ ...meta, labReportNo: v })}
            onCommit={() => onUpdateSample({ labReportNo: meta.labReportNo })}
          />
          <TextField
            label="Date analyzed"
            testId={`dateAnalyzed-${sample.id}`}
            type="date"
            value={meta.dateAnalyzed}
            onChange={(v) => setMeta({ ...meta, dateAnalyzed: v })}
            onCommit={() => onUpdateSample({ dateAnalyzed: meta.dateAnalyzed })}
          />
          <TextField
            label="Analyst"
            testId={`analyst-${sample.id}`}
            value={meta.analyst}
            onChange={(v) => setMeta({ ...meta, analyst: v })}
            onCommit={() => onUpdateSample({ analyst: meta.analyst })}
          />
        </FieldRow>
        <TextField
          label="Lab comments"
          testId={`resultNotes-${sample.id}`}
          value={meta.resultNotes}
          onChange={(v) => setMeta({ ...meta, resultNotes: v })}
          onCommit={() => onUpdateSample({ resultNotes: meta.resultNotes })}
          placeholder="Background debris rating, overloading, partial obscuration…"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="h-7 w-7" />}
          title="No counts entered"
          description={
            isAir
              ? "Enter each taxon the lab reported. Spores per cubic metre are calculated from the air volume you recorded."
              : "Enter each taxon the lab reported for this surface or bulk sample."
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="hidden gap-3 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_120px_120px_120px_40px]">
            <span>Organism</span>
            <span>Raw count</span>
            <span>Lab /m³ (optional)</span>
            <span>Calculated /m³</span>
            <span />
          </div>
          {rows.map((r) => (
            <LabRow
              key={r.id}
              row={r}
              sample={sample}
              isAir={isAir}
              onSave={(data) => onUpdateRow(r.id, data)}
              onDelete={() => onDeleteRow(r.id)}
            />
          ))}
          <Separator className="my-2" />
          <div className="flex flex-wrap items-center gap-3 px-1">
            <span
              className="font-mono text-xs text-muted-foreground"
              data-testid={`text-sample-total-${sample.id}`}
            >
              Total {fmtCount(total)} spores/m³
            </span>
            {!isAir && (
              <span className="text-xs text-muted-foreground">
                Surface and bulk results are reported as counts, not per volume.
              </span>
            )}
            {isAir && !vol && (
              <Tone tone="warn">Add calibrated flow and run time on the Samples tab</Tone>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function LabRow({
  row,
  sample,
  isAir,
  onSave,
  onDelete,
}: {
  row: LabResult;
  sample: Sample;
  isAir: boolean;
  onSave: (data: Partial<LabResult>) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState({
    organism: row.organism,
    rawCount: row.rawCount?.toString() ?? "",
    perM3Override: row.perM3Override?.toString() ?? "",
  });
  const save = () =>
    onSave({
      organism: f.organism,
      rawCount: num(f.rawCount),
      perM3Override: num(f.perM3Override),
    } as Partial<LabResult>);

  const computed = perM3(
    { ...row, rawCount: num(f.rawCount), perM3Override: num(f.perM3Override) } as LabResult,
    sample
  );
  const listId = `organisms-${row.id}`;

  return (
    <div
      className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_120px_120px_120px_40px] sm:items-center sm:border-0 sm:p-1"
      data-testid={`row-lab-${row.id}`}
    >
      <div>
        <Label className="text-xs font-medium text-muted-foreground sm:hidden">Organism</Label>
        <Input
          list={listId}
          value={f.organism}
          onChange={(e) => setF({ ...f, organism: e.target.value })}
          onBlur={save}
          placeholder="Aspergillus/Penicillium"
          data-testid={`input-lab-organism-${row.id}`}
          className="mt-1.5 sm:mt-0"
        />
        <datalist id={listId}>
          {ORGANISM_PRESETS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground sm:hidden">Raw count</Label>
        <Input
          value={f.rawCount}
          onChange={(e) => setF({ ...f, rawCount: e.target.value })}
          onBlur={save}
          inputMode="decimal"
          data-testid={`input-lab-raw-${row.id}`}
          className="mt-1.5 font-mono sm:mt-0"
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-muted-foreground sm:hidden">
          Lab /m³ (optional)
        </Label>
        <Input
          value={f.perM3Override}
          onChange={(e) => setF({ ...f, perM3Override: e.target.value })}
          onBlur={save}
          inputMode="decimal"
          placeholder={isAir ? "auto" : "n/a"}
          data-testid={`input-lab-perm3-${row.id}`}
          className="mt-1.5 font-mono sm:mt-0"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:hidden">
          Calculated /m³
        </span>
        <span
          className="font-mono text-sm tabular-nums"
          data-testid={`text-lab-computed-${row.id}`}
        >
          {fmtCount(computed)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        data-testid={`button-delete-lab-${row.id}`}
        aria-label="Delete row"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
