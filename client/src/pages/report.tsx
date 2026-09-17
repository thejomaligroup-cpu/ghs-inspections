import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Inspection, Reading, Sample, Custody, Finding, LabResult } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoFull } from "@/components/kit";
import { dewPointF, gpp, moistureStatus, sampleVolume, fmt } from "@/lib/psych";
import { buildComparison, perM3, fmtCount, AIR_TYPES } from "@/lib/lab";
import { ArrowLeft, Printer } from "lucide-react";

type Full = {
  inspection: Inspection;
  readings: Reading[];
  samples: Sample[];
  custody: Custody;
  findings: Finding[];
  labResults: LabResult[];
};

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-b border-border pb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Pair({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading } = useQuery<Full>({
    queryKey: ["/api/inspections", id, "full"],
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const { inspection: i, readings, samples, custody, findings, labResults } = data;
  const comparison = buildComparison(samples, labResults);
  const airSamples = samples.filter((s) =>
    ["Indoor Air", "Outdoor Control", "Wall Cavity"].includes(s.sampleType)
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link href={`/inspection/${id}`}>
          <Button variant="ghost" size="sm" data-testid="button-back-report">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to inspection
          </Button>
        </Link>
        <Button size="sm" onClick={() => window.print()} data-testid="button-print">
          <Printer className="mr-1.5 h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      <article className="print-plain rounded-lg border border-border bg-card p-6 sm:p-8">
        {/* Header */}
        <header className="print-block mb-6 flex items-start justify-between gap-6 border-b border-border pb-5">
          <div className="flex items-start gap-4">
            <LogoFull className="h-20 shrink-0" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Mold and Indoor Air Quality Inspection Report
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {i.companyName || "Green Home Solutions"}
              </p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono text-xs text-muted-foreground">{i.jobNumber || `#${i.id}`}</p>
            <p className="mt-1">{i.inspectionDate || "—"}</p>
            <p className="text-muted-foreground">{i.status}</p>
          </div>
        </header>

        {/* Client & property */}
        <section className="print-block mb-7 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <H>Client</H>
            <Pair label="Name" value={i.clientName} />
            <Pair label="Phone" value={i.clientPhone} />
            <Pair label="Email" value={i.clientEmail} />
            <Pair label="Reason" value={i.reasonForInspection} />
            <Pair label="Scope" value={i.scope} />
          </div>
          <div>
            <H>Property</H>
            <Pair
              label="Address"
              value={[i.propertyAddress, i.propertyCity, i.propertyState, i.propertyZip]
                .filter(Boolean)
                .join(", ")}
            />
            <Pair label="Type" value={i.propertyType} />
            <Pair label="Year built / size" value={[i.yearBuilt, i.squareFeet && `${i.squareFeet} sq ft`].filter(Boolean).join(" · ")} />
            <Pair label="Occupied" value={i.occupied} />
            <Pair label="HVAC" value={i.hvacType} />
          </div>
        </section>

        <section className="print-block mb-7 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <H>Inspector</H>
            <Pair label="Name" value={i.inspectorName} />
            <Pair label="Record owner" value={i.ownerName} />
            <Pair
              label="Last edited"
              value={
                i.lastEditedBy
                  ? `${i.lastEditedBy}${i.lastEditedAt ? ` · ${new Date(i.lastEditedAt).toLocaleString()}` : ""}`
                  : ""
              }
            />
            <Pair label="Certification" value={i.inspectorCert} />
            <Pair label="Company" value={i.companyName} />
          </div>
          <div>
            <H>Ambient baseline</H>
            <Pair label="Outdoor temp" value={i.outdoorTemp && `${i.outdoorTemp} °F`} />
            <Pair label="Outdoor RH" value={i.outdoorRh && `${i.outdoorRh} %`} />
            <Pair
              label="Dew point / GPP"
              value={(() => {
                const t = Number(i.outdoorTemp) || null;
                const h = Number(i.outdoorRh) || null;
                const d = dewPointF(t, h);
                const g = gpp(t, h);
                return d == null || g == null ? "" : `${fmt(d)} °F · ${fmt(g)} GPP`;
              })()}
            />
            <Pair label="Weather" value={i.weather} />
          </div>
        </section>

        {(i.occupantConcerns || i.waterHistory) && (
          <section className="print-block mb-7">
            <H>Background</H>
            {i.occupantConcerns && (
              <p className="mb-3 whitespace-pre-wrap text-sm">
                <span className="font-medium">Occupant concerns: </span>
                {i.occupantConcerns}
              </p>
            )}
            {i.waterHistory && (
              <p className="whitespace-pre-wrap text-sm">
                <span className="font-medium">Water intrusion history: </span>
                {i.waterHistory}
              </p>
            )}
          </section>
        )}

        {i.summary && (
          <section className="print-block mb-7">
            <H>Summary of observations</H>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="text-report-summary">
              {i.summary}
            </p>
          </section>
        )}

        {/* Readings */}
        <section className="print-block mb-7">
          <H>Moisture and thermal readings</H>
          {readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No readings recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Location</th>
                    <th className="py-2 pr-3 font-medium">Material</th>
                    <th className="py-2 pr-3 font-medium">Meter</th>
                    <th className="py-2 pr-3 font-medium">%WME</th>
                    <th className="py-2 pr-3 font-medium">Temp °F</th>
                    <th className="py-2 pr-3 font-medium">RH %</th>
                    <th className="py-2 pr-3 font-medium">Dew pt</th>
                    <th className="py-2 pr-3 font-medium">GPP</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {readings.map((r) => {
                    const ms = moistureStatus(r.moisture, r.dryStandard);
                    return (
                      <tr key={r.id} className="border-b border-border/60" data-testid={`report-reading-${r.id}`}>
                        <td className="py-2 pr-3 font-sans">{r.room || "—"}</td>
                        <td className="py-2 pr-3 font-sans">{r.material || "—"}</td>
                        <td className="py-2 pr-3 font-sans">{r.meterType}</td>
                        <td className="py-2 pr-3">{fmt(r.moisture)}</td>
                        <td className="py-2 pr-3">{fmt(r.tempF)}</td>
                        <td className="py-2 pr-3">{fmt(r.rh)}</td>
                        <td className="py-2 pr-3">{fmt(dewPointF(r.tempF, r.rh))}</td>
                        <td className="py-2 pr-3">{fmt(gpp(r.tempF, r.rh))}</td>
                        <td className="py-2 font-sans">{ms?.label ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Samples */}
        <section className="print-block mb-7">
          <H>Samples collected</H>
          {samples.length === 0 ? (
            <p className="text-sm text-muted-foreground">No samples collected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">ID</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Location</th>
                    <th className="py-2 pr-3 font-medium">Media / Lot</th>
                    <th className="py-2 pr-3 font-medium">Flow</th>
                    <th className="py-2 pr-3 font-medium">Min</th>
                    <th className="py-2 pr-3 font-medium">Volume L</th>
                    <th className="py-2 font-medium">Analysis</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {samples.map((s) => (
                    <tr key={s.id} className="border-b border-border/60" data-testid={`report-sample-${s.id}`}>
                      <td className="py-2 pr-3">{s.sampleId || "—"}</td>
                      <td className="py-2 pr-3 font-sans">{s.sampleType}</td>
                      <td className="py-2 pr-3 font-sans">{s.location || "—"}</td>
                      <td className="py-2 pr-3 font-sans">
                        {[s.cassetteType, s.cassetteLot].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="py-2 pr-3">{fmt(s.calFlowLpm)}</td>
                      <td className="py-2 pr-3">{fmt(s.durationMin, 0)}</td>
                      <td className="py-2 pr-3">{fmt(sampleVolume(s.calFlowLpm, s.durationMin), 0)}</td>
                      <td className="py-2 font-sans">{s.analysisRequested || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {airSamples.length > 0 &&
                !samples.some((s) => s.sampleType === "Outdoor Control") && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Note: no outdoor control sample was collected; indoor spore counts are reported
                    without a baseline comparison.
                  </p>
                )}
            </div>
          )}
        </section>


        {/* Lab results */}
        {labResults.length > 0 && (
          <section className="print-block mb-7">
            <H>Laboratory results</H>
            {samples
              .filter((s) => labResults.some((r) => r.sampleRowId === s.id))
              .map((s) => {
                const rows = labResults.filter((r) => r.sampleRowId === s.id);
                const isAir = AIR_TYPES.includes(s.sampleType);
                const total = rows.reduce((sum, r) => {
                  if (r.organism.trim() === "Total spores") return sum;
                  const v = perM3(r, s);
                  return v == null ? sum : sum + v;
                }, 0);
                return (
                  <div key={s.id} className="mb-5" data-testid={`report-lab-${s.id}`}>
                    <p className="text-sm font-semibold">
                      {s.sampleId || `Sample ${s.id}`} — {s.sampleType}
                      {s.location ? ` · ${s.location}` : ""}
                    </p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {[
                        s.labReportNo && `Report ${s.labReportNo}`,
                        s.dateAnalyzed && `Analyzed ${s.dateAnalyzed}`,
                        s.analyst && `Analyst ${s.analyst}`,
                        isAir && sampleVolume(s.calFlowLpm, s.durationMin)
                          ? `${fmt(sampleVolume(s.calFlowLpm, s.durationMin), 0)} L sampled`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="py-1.5 pr-3 font-medium">Organism</th>
                          <th className="py-1.5 pr-3 font-medium">Raw count</th>
                          <th className="py-1.5 font-medium">{isAir ? "Spores /m³" : "Reported"}</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {rows.map((r) => (
                          <tr key={r.id} className="border-b border-border/60">
                            <td className="py-1.5 pr-3 font-sans">{r.organism || "—"}</td>
                            <td className="py-1.5 pr-3">{fmtCount(r.rawCount)}</td>
                            <td className="py-1.5">{fmtCount(perM3(r, s))}</td>
                          </tr>
                        ))}
                        {isAir && (
                          <tr>
                            <td className="py-1.5 pr-3 font-sans font-semibold">Total</td>
                            <td className="py-1.5 pr-3" />
                            <td className="py-1.5 font-semibold">{fmtCount(total)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {s.resultNotes && (
                      <p className="mt-1.5 text-xs text-muted-foreground">{s.resultNotes}</p>
                    )}
                  </div>
                );
              })}
          </section>
        )}

        {/* Indoor vs outdoor */}
        {comparison.rows.length > 0 && (
          <section className="print-block mb-7">
            <H>Indoor vs. outdoor comparison</H>
            <p className="mb-3 text-sm" data-testid="text-report-verdict">
              <span className="font-semibold">{comparison.verdict.label}. </span>
              {comparison.verdict.detail}
            </p>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Organism</th>
                  <th className="py-1.5 pr-3 font-medium">Indoor /m³</th>
                  <th className="py-1.5 pr-3 font-medium">Outdoor /m³</th>
                  <th className="py-1.5 pr-3 font-medium">I/O ratio</th>
                  <th className="py-1.5 font-medium">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((r) => (
                  <tr key={r.organism} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">
                      {r.organism}
                      {r.marker ? " *" : ""}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{fmtCount(r.indoor)}</td>
                    <td className="py-1.5 pr-3 font-mono">{fmtCount(r.outdoor)}</td>
                    <td className="py-1.5 pr-3 font-mono">
                      {r.ratio == null ? "n/a" : `${r.ratio.toFixed(1)}x`}
                    </td>
                    <td className="py-1.5">{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              * Genera generally associated with water-damaged building materials. Indoor/outdoor
              ratios are a screening aid and are interpreted together with moisture readings and
              visual findings.
            </p>
          </section>
        )}

        {/* Chain of custody */}
        {samples.length > 0 && (
          <section className="print-block mb-7">
            <H>Chain of custody</H>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <Pair label="Laboratory" value={custody.labName} />
                <Pair label="Lab address" value={custody.labAddress} />
                <Pair label="Lab contact" value={custody.labContact} />
                <Pair label="Turnaround" value={custody.turnaround} />
                <Pair label="Ship method" value={custody.shipMethod} />
                <Pair label="Tracking #" value={custody.trackingNumber} />
              </div>
              <div>
                <Pair label="Relinquished by" value={custody.relinquishedBy} />
                <Pair label="Date relinquished" value={custody.relinquishedDate} />
                <Pair label="Received by" value={custody.receivedBy} />
                <Pair label="Date received" value={custody.receivedDate} />
                <Pair label="Seal intact" value={custody.sealIntact} />
                <Pair label="Cooler temp" value={custody.coolerTemp && `${custody.coolerTemp} °F`} />
              </div>
            </div>
            {custody.remarks && (
              <p className="mt-3 whitespace-pre-wrap text-sm">{custody.remarks}</p>
            )}
            <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <p className="mt-1 text-xs text-muted-foreground">Relinquished by (signature / date)</p>
              </div>
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <p className="mt-1 text-xs text-muted-foreground">Received by (signature / date)</p>
              </div>
            </div>
          </section>
        )}

        {/* Findings */}
        <section className="mb-7">
          <H>Findings and recommendations</H>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No findings recorded.</p>
          ) : (
            <div className="space-y-5">
              {findings.map((f, idx) => (
                <div
                  key={f.id}
                  className="print-block grid grid-cols-1 gap-4 rounded-md border border-border p-4 sm:grid-cols-[1fr_220px]"
                  data-testid={`report-finding-${f.id}`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {idx + 1}. {f.room || "Unspecified area"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.conditionClass} · {f.moldGrowth}
                      {f.affectedMaterial ? ` · ${f.affectedMaterial}` : ""}
                      {f.estimatedArea ? ` · ${f.estimatedArea}` : ""}
                    </p>
                    {f.observation && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{f.observation}</p>
                    )}
                    {f.moistureSource && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Moisture source: </span>
                        {f.moistureSource}
                      </p>
                    )}
                    {f.recommendation && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        <span className="font-medium">Recommendation: </span>
                        {f.recommendation}
                      </p>
                    )}
                  </div>
                  {f.photo && (
                    <figure>
                      <img
                        src={f.photo}
                        alt={f.photoCaption || `Finding ${idx + 1}`}
                        className="w-full rounded-md border border-border object-cover"
                      />
                      {f.photoCaption && (
                        <figcaption className="mt-1 text-xs text-muted-foreground">
                          {f.photoCaption}
                        </figcaption>
                      )}
                    </figure>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {i.recommendations && (
          <section className="print-block mb-7">
            <H>Overall recommendations</H>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{i.recommendations}</p>
          </section>
        )}

        <section className="print-block">
          <H>Limitations</H>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {i.limitations ||
              "This inspection reflects conditions observed at the time and locations documented. Sampling results describe conditions only at the point and moment of collection. Concealed conditions within wall cavities, ceilings, or under floor coverings were not evaluated unless expressly noted. No warranty is expressed or implied."}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
            <div>
              <div className="h-10 border-b border-foreground/40" />
              <p className="mt-1 text-xs text-muted-foreground">
                Inspector signature{i.inspectorName ? ` — ${i.inspectorName}` : ""}
              </p>
            </div>
            <div>
              <div className="h-10 border-b border-foreground/40" />
              <p className="mt-1 text-xs text-muted-foreground">Date</p>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
