import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Sample } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionTitle, TextField, FieldRow, Tone } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, CircleAlert } from "lucide-react";
import { fmtCount } from "@/lib/lab";

type ParsedCount = { organism: string; rawCount: number | null; perM3: number | null };
type ParsedSample = {
  sampleLabel: string;
  location: string;
  sampleType: string;
  volumeL: number | null;
  notes: string;
  counts: ParsedCount[];
};
type ParsedReport = {
  labName: string;
  labReportNo: string;
  dateAnalyzed: string;
  analyst: string;
  samples: ParsedSample[];
};

type Draft = {
  include: boolean;
  replace: boolean;
  sampleRowId: string;
  parsed: ParsedSample;
};

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMatch(parsed: ParsedSample, samples: Sample[], taken: Set<number>): string {
  const label = norm(parsed.sampleLabel);
  const byId = samples.find((s) => s.sampleId && norm(s.sampleId) === label && label !== "");
  if (byId && !taken.has(byId.id)) return String(byId.id);
  const loc = norm(parsed.location);
  const byLoc =
    loc.length > 3
      ? samples.find((s) => s.location && norm(s.location).includes(loc) && !taken.has(s.id))
      : undefined;
  if (byLoc) return String(byLoc.id);
  const byType = samples.filter((s) => s.sampleType === parsed.sampleType && !taken.has(s.id));
  if (byType.length === 1) return String(byType[0].id);
  return "";
}

function cleanError(err: any): string | null {
  const raw = String(err?.message ?? "");
  const match = raw.match(/\{[\s\S]*\}$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed?.message) return String(parsed.message);
    } catch {
      /* fall through */
    }
  }
  return raw.replace(/^\d{3}:\s*/, "") || null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

export function LabUpload({
  inspectionId,
  samples,
}: {
  inspectionId: number;
  samples: Sample[];
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [header, setHeader] = useState({ labReportNo: "", dateAnalyzed: "", analyst: "" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState(false);

  const parse = useMutation({
    mutationFn: async (file: File) => {
      const data = await fileToBase64(file);
      const res = await apiRequest("POST", `/api/inspections/${inspectionId}/lab-parse`, {
        fileName: file.name,
        mimeType: file.type,
        data,
      });
      return (await res.json()) as ParsedReport;
    },
    onSuccess: (data) => {
      const taken = new Set<number>();
      const rows: Draft[] = data.samples.map((p) => {
        const match = autoMatch(p, samples, taken);
        if (match) taken.add(Number(match));
        return { include: p.counts.length > 0, replace: true, sampleRowId: match, parsed: p };
      });
      setReport(data);
      setHeader({
        labReportNo: data.labReportNo ?? "",
        dateAnalyzed: data.dateAnalyzed ?? "",
        analyst: data.analyst ?? "",
      });
      setDrafts(rows);
      setOpen(true);
      if (data.samples.length === 0) {
        toast({
          title: "No sample results found",
          description: "Check that the file is the lab's analysis report, or enter counts manually.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Could not read that report",
        description: cleanError(err) ?? "Try a PDF, spreadsheet, or clear photo of the report.",
        variant: "destructive",
      });
    },
  });

  const importRows = useMutation({
    mutationFn: async () => {
      const payload = drafts
        .filter((d) => d.include && d.sampleRowId)
        .map((d) => ({
          sampleRowId: Number(d.sampleRowId),
          replace: d.replace,
          labReportNo: header.labReportNo,
          dateAnalyzed: header.dateAnalyzed,
          analyst: header.analyst,
          notes: d.parsed.notes,
          counts: d.parsed.counts,
        }));
      const res = await apiRequest("POST", `/api/inspections/${inspectionId}/lab-import`, {
        samples: payload,
      });
      return (await res.json()) as { created: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/inspections", inspectionId, "lab-results"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", inspectionId, "samples"] });
      setOpen(false);
      setReport(null);
      toast({
        title: "Lab results imported",
        description: `${data.created} count${data.created === 1 ? "" : "s"} added from ${fileName}.`,
      });
    },
    onError: () =>
      toast({ title: "Import failed", description: "Nothing was saved.", variant: "destructive" }),
  });

  const readyCount = drafts.filter((d) => d.include && d.sampleRowId).length;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Upload the lab report"
        description="Drop in the PDF, spreadsheet, or a photo of the report the lab sent back. Counts are read out for you to review before anything is saved."
      />
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) {
            setFileName(file.name);
            parse.mutate(file);
          }
        }}
        data-testid="dropzone-lab-report"
      >
        {parse.isPending ? (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground" data-testid="text-parsing">
              Reading {fileName}…
            </p>
          </>
        ) : (
          <>
            <FileText className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag a lab report here, or choose a file
            </p>
            <Button onClick={() => inputRef.current?.click()} data-testid="button-upload-lab-report">
              <Upload className="mr-1.5 h-4 w-4" /> Upload lab report
            </Button>
            <p className="text-xs text-muted-foreground">
              PDF, XLSX, CSV, PNG or JPG · scans and phone photos work
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.txt,image/*"
          className="hidden"
          data-testid="input-lab-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setFileName(file.name);
              parse.mutate(file);
            }
            e.target.value = "";
          }}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review lab results</DialogTitle>
            <DialogDescription>
              {report?.labName
                ? `Read from ${report.labName} · ${fileName}`
                : `Read from ${fileName}`}
              . Check the sample each block belongs to, then import.
            </DialogDescription>
          </DialogHeader>

          <FieldRow cols={3}>
            <TextField
              label="Lab report #"
              testId="import-labReportNo"
              value={header.labReportNo}
              onChange={(v) => setHeader({ ...header, labReportNo: v })}
            />
            <TextField
              label="Date analyzed"
              testId="import-dateAnalyzed"
              type="date"
              value={header.dateAnalyzed}
              onChange={(v) => setHeader({ ...header, dateAnalyzed: v })}
            />
            <TextField
              label="Analyst"
              testId="import-analyst"
              value={header.analyst}
              onChange={(v) => setHeader({ ...header, analyst: v })}
            />
          </FieldRow>

          <div className="space-y-4">
            {drafts.length === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-border p-4 text-sm text-muted-foreground">
                <CircleAlert className="h-4 w-4" /> No sample results were found in this file.
              </div>
            )}
            {drafts.map((d, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border p-4"
                data-testid={`card-import-${idx}`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={d.include}
                        onCheckedChange={(v) =>
                          setDrafts(
                            drafts.map((x, i) => (i === idx ? { ...x, include: v === true } : x))
                          )
                        }
                        data-testid={`checkbox-import-${idx}`}
                        id={`inc-${idx}`}
                      />
                      <Label htmlFor={`inc-${idx}`} className="text-sm font-semibold">
                        {d.parsed.sampleLabel || `Block ${idx + 1}`}
                        {d.parsed.sampleType ? ` — ${d.parsed.sampleType}` : ""}
                      </Label>
                    </div>
                    <p className="mt-1 pl-6 text-xs text-muted-foreground">
                      {[
                        d.parsed.location,
                        d.parsed.volumeL ? `${d.parsed.volumeL} L` : null,
                        `${d.parsed.counts.length} taxa`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="min-w-52">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Apply to sample
                    </Label>
                    <Select
                      value={d.sampleRowId}
                      onValueChange={(v) =>
                        setDrafts(drafts.map((x, i) => (i === idx ? { ...x, sampleRowId: v } : x)))
                      }
                    >
                      <SelectTrigger className="mt-1.5" data-testid={`select-import-${idx}`}>
                        <SelectValue placeholder="Choose a sample" />
                      </SelectTrigger>
                      <SelectContent>
                        {samples.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {(s.sampleId || `Sample ${s.id}`) + ` — ${s.sampleType}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Organism</th>
                      <th className="py-1.5 pr-3 font-medium">Raw count</th>
                      <th className="py-1.5 font-medium">Lab /m³</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {d.parsed.counts.map((c, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="py-1.5 pr-3 font-sans">{c.organism}</td>
                        <td className="py-1.5 pr-3">{fmtCount(c.rawCount)}</td>
                        <td className="py-1.5">{fmtCount(c.perM3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.parsed.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">{d.parsed.notes}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Checkbox
                    checked={d.replace}
                    onCheckedChange={(v) =>
                      setDrafts(
                        drafts.map((x, i) => (i === idx ? { ...x, replace: v === true } : x))
                      )
                    }
                    id={`rep-${idx}`}
                    data-testid={`checkbox-replace-${idx}`}
                  />
                  <Label htmlFor={`rep-${idx}`} className="text-xs text-muted-foreground">
                    Replace any counts already entered for this sample
                  </Label>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tone tone={readyCount > 0 ? "ok" : "warn"}>
              {readyCount > 0
                ? `${readyCount} sample${readyCount === 1 ? "" : "s"} ready to import`
                : "Match at least one block to a sample"}
            </Tone>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-import">
                Cancel
              </Button>
              <Button
                onClick={() => importRows.mutate()}
                disabled={readyCount === 0 || importRows.isPending}
                data-testid="button-confirm-import"
              >
                {importRows.isPending ? "Importing…" : "Import results"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
