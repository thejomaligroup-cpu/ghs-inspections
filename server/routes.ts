import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { parseLabReport } from "./labParse";
import { exportToSalesSheet, listCandidateSheets } from "./salesSheet";

type Actor = { id: number; name: string; role: string } | undefined;

function actorOf(req: any): Actor {
  const id = Number(req.header("x-inspector-id"));
  if (!Number.isFinite(id) || id <= 0) return undefined;
  const found = storage.getInspector(id);
  if (!found || !found.active) return undefined;
  return { id: found.id, name: found.name, role: found.role };
}

/** Owner or admin may edit; unowned legacy records are open to any signed-in inspector. */
function mayEdit(inspectionId: number, actor: Actor): boolean {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  const insp = storage.getInspection(inspectionId);
  if (!insp) return false;
  return !insp.ownerId || insp.ownerId === actor.id;
}

function publicInspector(i: any) {
  const { pin, ...rest } = i;
  return rest;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  /* ---------------- Team & sign-in ---------------- */
  app.get("/api/team", (_req, res) => {
    res.json(storage.listInspectors().map(publicInspector));
  });

  app.get("/api/team/state", (_req, res) => {
    const team = storage.listInspectors();
    res.json({ needsSetup: !team.some((i) => i.role === "admin"), names: team.filter((i) => i.active).map((i) => i.name) });
  });

  app.post("/api/auth/setup", (req, res) => {
    if (storage.listInspectors().some((i) => i.role === "admin"))
      return res.status(409).json({ message: "Team is already set up. Sign in instead." });
    const name = String(req.body?.name ?? "").trim();
    const pin = String(req.body?.pin ?? "").trim();
    if (name.length < 2 || pin.length < 4)
      return res.status(400).json({ message: "Enter a name and a PIN of at least 4 digits." });
    const created = storage.createInspector({
      name,
      pin,
      role: "admin",
      cert: String(req.body?.cert ?? ""),
      phone: String(req.body?.phone ?? ""),
    });
    res.json(publicInspector(created));
  });

  app.post("/api/auth/login", (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const pin = String(req.body?.pin ?? "").trim();
    const found = storage.findInspectorByName(name);
    if (!found || found.pin !== pin || !found.active)
      return res.status(401).json({ message: "That name and PIN don't match an active inspector." });
    res.json(publicInspector(found));
  });

  app.get("/api/auth/me", (req, res) => {
    const actor = actorOf(req);
    if (!actor) return res.status(401).json({ message: "Not signed in" });
    res.json(actor);
  });

  app.post("/api/team", (req, res) => {
    const actor = actorOf(req);
    if (!actor || actor.role !== "admin")
      return res.status(403).json({ message: "Only an admin can add inspectors." });
    const name = String(req.body?.name ?? "").trim();
    const pin = String(req.body?.pin ?? "").trim();
    if (name.length < 2 || pin.length < 4)
      return res.status(400).json({ message: "Enter a name and a PIN of at least 4 digits." });
    if (storage.findInspectorByName(name))
      return res.status(409).json({ message: "An inspector with that name already exists." });
    res.json(
      publicInspector(
        storage.createInspector({
          name,
          pin,
          role: req.body?.role === "admin" ? "admin" : "inspector",
          cert: String(req.body?.cert ?? ""),
          phone: String(req.body?.phone ?? ""),
        })
      )
    );
  });

  app.patch("/api/team/:tid", (req, res) => {
    const actor = actorOf(req);
    const tid = Number(req.params.tid);
    const isSelf = actor?.id === tid;
    if (!actor || (actor.role !== "admin" && !isSelf))
      return res.status(403).json({ message: "Not allowed." });
    const patch: Record<string, unknown> = {};
    for (const key of ["cert", "phone", "pin", "name"]) {
      if (typeof req.body?.[key] === "string" && req.body[key].trim() !== "")
        patch[key] = req.body[key].trim();
    }
    if (actor.role === "admin") {
      for (const key of ["sheetId", "sheetName"]) {
        if (typeof req.body?.[key] === "string") patch[key] = req.body[key].trim();
      }
      if (req.body?.role === "admin" || req.body?.role === "inspector") patch.role = req.body.role;
      if (typeof req.body?.active === "boolean") patch.active = req.body.active ? 1 : 0;
      if (isSelf && patch.active === 0)
        return res.status(400).json({ message: "You cannot deactivate your own account." });
    }
    const updated = storage.updateInspector(tid, patch as any);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(publicInspector(updated));
  });

  /* ---------------- Admin: sales sheets ---------------- */
  app.get("/api/sheets", async (req, res) => {
    const actor = actorOf(req);
    if (actor?.role !== "admin")
      return res.status(403).json({ message: "Admins only." });
    try {
      res.json(await listCandidateSheets());
    } catch (err: any) {
      res.status(502).json({ message: err?.message ?? "Could not reach Google Drive." });
    }
  });

  /* ---------------- Admin: operations overview ---------------- */
  app.get("/api/overview", (req, res) => {
    const actor = actorOf(req);
    if (!actor) return res.status(401).json({ message: "Sign in first." });
    const team = storage.listInspectors();
    const all = storage.listInspections();
    const monthKey = (d: string) => (d || "").slice(0, 7);
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const byInspector = team.map((t) => {
      const mine = all.filter((i) => i.ownerId === t.id);
      return {
        id: t.id,
        name: t.name,
        role: t.role,
        active: t.active,
        cert: t.cert,
        phone: t.phone,
        sheetId: t.sheetId,
        sheetName: t.sheetName,
        total: mine.length,
        thisMonth: mine.filter((i) => monthKey(i.inspectionDate) === thisMonth).length,
        open: mine.filter((i) => i.status !== "Complete").length,
        complete: mine.filter((i) => i.status === "Complete").length,
        awaitingExport: mine.filter((i) => !i.exportedAt).length,
      };
    });

    res.json({
      totals: {
        inspections: all.length,
        thisMonth: all.filter((i) => monthKey(i.inspectionDate) === thisMonth).length,
        open: all.filter((i) => i.status !== "Complete").length,
        complete: all.filter((i) => i.status === "Complete").length,
        unassigned: all.filter((i) => !i.ownerId).length,
        awaitingExport: all.filter((i) => !i.exportedAt).length,
      },
      inspectors: byInspector,
      recent: all
        .slice()
        .sort((a, b) => (b.lastEditedAt || "").localeCompare(a.lastEditedAt || ""))
        .slice(0, 8)
        .map((i) => ({
          id: i.id,
          jobNumber: i.jobNumber,
          clientName: i.clientName,
          propertyCity: i.propertyCity,
          inspectionDate: i.inspectionDate,
          status: i.status,
          ownerName: i.ownerName,
          lastEditedBy: i.lastEditedBy,
          lastEditedAt: i.lastEditedAt,
          exportedAt: i.exportedAt,
          exportedTo: i.exportedTo,
        })),
    });
  });

  /* ---------------- Write permission gate ---------------- */
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/") || req.method === "GET" || req.method === "HEAD")
      return next();
    if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/team")) return next();

    const actor = actorOf(req);
    if (!actor) return res.status(401).json({ message: "Sign in to make changes." });
    (req as any).actor = actor;

    let inspectionId: number | undefined;
    const m = req.path.match(/^\/api\/inspections\/(\d+)/);
    if (m) inspectionId = Number(m[1]);
    else {
      const child = req.path.match(/^\/api\/(readings|samples|lab-results|findings)\/(\d+)/);
      if (child) {
        const cid = Number(child[2]);
        inspectionId =
          child[1] === "readings"
            ? storage.inspectionIdForReading(cid)
            : child[1] === "samples"
              ? storage.inspectionIdForSample(cid)
              : child[1] === "lab-results"
                ? storage.inspectionIdForLabResult(cid)
                : storage.inspectionIdForFinding(cid);
      }
    }

    if (inspectionId === undefined) return next(); // e.g. creating a new inspection
    if (!mayEdit(inspectionId, actor)) {
      const insp = storage.getInspection(inspectionId);
      return res.status(403).json({
        message: `This inspection belongs to ${insp?.ownerName || "another inspector"}. You can view and print it, but only ${insp?.ownerName || "the owner"} or an admin can change it.`,
      });
    }
    storage.stampInspection(inspectionId, actor.name);
    next();
  });

  /* Inspections */
  app.get("/api/inspections", (_req, res) => {
    res.json(storage.listInspections());
  });

  app.post("/api/inspections", (req, res) => {
    const actor = (req as any).actor as Actor;
    const body = req.body ?? {};
    const owner = actor ? storage.getInspector(actor.id) : undefined;
    res.json(
      storage.createInspection({
        ...body,
        ownerId: actor?.id ?? null,
        ownerName: actor?.name ?? "",
        lastEditedBy: actor?.name ?? "",
        lastEditedAt: new Date().toISOString(),
        inspectorName: body.inspectorName || actor?.name || "",
        inspectorCert: body.inspectorCert || owner?.cert || "",
      })
    );
  });

  app.get("/api/inspections/:id", (req, res) => {
    const item = storage.getInspection(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.patch("/api/inspections/:id", (req, res) => {
    const body = { ...(req.body ?? {}) };
    delete body.ownerId;
    delete body.ownerName;
    const item = storage.updateInspection(Number(req.params.id), body);
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  });

  app.delete("/api/inspections/:id", (req, res) => {
    storage.deleteInspection(Number(req.params.id));
    res.json({ ok: true });
  });

  /* Full record for report view */
  app.get("/api/inspections/:id/full", (req, res) => {
    const id = Number(req.params.id);
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ message: "Not found" });
    res.json({
      inspection,
      readings: storage.listReadings(id),
      samples: storage.listSamples(id),
      custody: storage.getCustody(id),
      labResults: storage.listLabResults(id),
      findings: storage.listFindings(id),
    });
  });

  /* Readings */
  app.get("/api/inspections/:id/readings", (req, res) => {
    res.json(storage.listReadings(Number(req.params.id)));
  });
  app.post("/api/inspections/:id/readings", (req, res) => {
    res.json(storage.createReading({ ...req.body, inspectionId: Number(req.params.id) }));
  });
  app.patch("/api/readings/:rid", (req, res) => {
    res.json(storage.updateReading(Number(req.params.rid), req.body ?? {}));
  });
  app.delete("/api/readings/:rid", (req, res) => {
    storage.deleteReading(Number(req.params.rid));
    res.json({ ok: true });
  });

  /* Samples */
  app.get("/api/inspections/:id/samples", (req, res) => {
    res.json(storage.listSamples(Number(req.params.id)));
  });
  app.post("/api/inspections/:id/samples", (req, res) => {
    res.json(storage.createSample({ ...req.body, inspectionId: Number(req.params.id) }));
  });
  app.patch("/api/samples/:sid", (req, res) => {
    res.json(storage.updateSample(Number(req.params.sid), req.body ?? {}));
  });
  app.delete("/api/samples/:sid", (req, res) => {
    storage.deleteSample(Number(req.params.sid));
    res.json({ ok: true });
  });

  /* Lab results */
  app.get("/api/inspections/:id/lab-results", (req, res) => {
    res.json(storage.listLabResults(Number(req.params.id)));
  });
  app.post("/api/inspections/:id/lab-results", (req, res) => {
    res.json(
      storage.createLabResult({ ...req.body, inspectionId: Number(req.params.id) })
    );
  });
  app.patch("/api/lab-results/:lid", (req, res) => {
    res.json(storage.updateLabResult(Number(req.params.lid), req.body ?? {}));
  });
  app.delete("/api/lab-results/:lid", (req, res) => {
    storage.deleteLabResult(Number(req.params.lid));
    res.json({ ok: true });
  });

  /* Lab report upload — parse a returned lab report into draft rows (nothing saved yet) */
  app.post("/api/inspections/:id/lab-parse", async (req, res) => {
    const { fileName, mimeType, data } = req.body ?? {};
    if (!data) return res.status(400).json({ message: "No file data provided" });
    try {
      const buf = Buffer.from(String(data).replace(/^data:[^;]*;base64,/, ""), "base64");
      if (buf.length === 0) return res.status(400).json({ message: "Empty file" });
      const parsed = await parseLabReport(buf, String(fileName ?? "report"), String(mimeType ?? ""));
      res.json(parsed);
    } catch (err: any) {
      res.status(422).json({
        message:
          err?.message ??
          "Could not read that lab report. Enter the counts manually or try a different file.",
      });
    }
  });

  /* Commit reviewed lab report rows */
  app.post("/api/inspections/:id/lab-import", (req, res) => {
    const inspectionId = Number(req.params.id);
    const groups = Array.isArray(req.body?.samples) ? req.body.samples : [];
    let created = 0;
    for (const g of groups) {
      const sampleRowId = Number(g?.sampleRowId);
      if (!Number.isFinite(sampleRowId)) continue;
      if (g?.replace) {
        for (const existing of storage.listLabResults(inspectionId)) {
          if (existing.sampleRowId === sampleRowId) storage.deleteLabResult(existing.id);
        }
      }
      const meta: Record<string, unknown> = {};
      if (g?.labReportNo) meta.labReportNo = g.labReportNo;
      if (g?.dateAnalyzed) meta.dateAnalyzed = g.dateAnalyzed;
      if (g?.analyst) meta.analyst = g.analyst;
      if (g?.notes) meta.resultNotes = g.notes;
      meta.resultsReceived = 1;
      storage.updateSample(sampleRowId, meta);
      for (const c of Array.isArray(g?.counts) ? g.counts : []) {
        if (!c?.organism) continue;
        storage.createLabResult({
          inspectionId,
          sampleRowId,
          organism: String(c.organism),
          rawCount: c.rawCount ?? null,
          perM3Override: c.perM3 ?? null,
          notes: c.notes ?? "",
        } as any);
        created++;
      }
    }
    res.json({ ok: true, created });
  });

  /* ---------------- Sales-sheet export ---------------- */
  app.post("/api/inspections/:id/export-sheet", async (req, res) => {
    const id = Number(req.params.id);
    const inspection = storage.getInspection(id);
    if (!inspection) return res.status(404).json({ message: "Inspection not found." });
    const actor = (req as any).actor as { id: number; name: string; role: string } | undefined;

    // Which sheet? explicit override (admin picking), else the owner's mapped sheet.
    let spreadsheetId = typeof req.body?.spreadsheetId === "string" ? req.body.spreadsheetId.trim() : "";
    let sheetLabel = "";
    if (!spreadsheetId) {
      const owner = inspection.ownerId ? storage.getInspector(inspection.ownerId) : undefined;
      spreadsheetId = owner?.sheetId ?? "";
      sheetLabel = owner?.sheetName ?? "";
      if (!spreadsheetId) {
        return res.status(400).json({
          message: `No sales sheet is linked to ${owner?.name ?? "this inspector"} yet. An admin can link one in the Operations dashboard.`,
        });
      }
    }
    if (!inspection.clientName.trim())
      return res.status(400).json({ message: "Add the customer name before sending it to the sheet." });

    try {
      const result = await exportToSalesSheet({
        spreadsheetId,
        inspectionDate: inspection.inspectionDate,
        clientName: inspection.clientName,
        address: inspection.propertyAddress,
        city: inspection.propertyCity,
      });
      const stamp = new Date().toISOString();
      storage.updateInspection(id, {
        exportedAt: stamp,
        exportedBy: actor?.name ?? "",
        exportedTo: `${sheetLabel || "Sales sheet"} · ${result.tab} row ${result.row}`,
      } as any);
      res.json({ ok: true, ...result, sheetName: sheetLabel });
    } catch (err: any) {
      res.status(502).json({ message: err?.message ?? "Could not write to the sales sheet." });
    }
  });

  /* Custody */
  app.get("/api/inspections/:id/custody", (req, res) => {
    res.json(storage.getCustody(Number(req.params.id)));
  });
  app.patch("/api/inspections/:id/custody", (req, res) => {
    res.json(storage.updateCustody(Number(req.params.id), req.body ?? {}));
  });

  /* Findings */
  app.get("/api/inspections/:id/findings", (req, res) => {
    res.json(storage.listFindings(Number(req.params.id)));
  });
  app.post("/api/inspections/:id/findings", (req, res) => {
    res.json(storage.createFinding({ ...req.body, inspectionId: Number(req.params.id) }));
  });
  app.patch("/api/findings/:fid", (req, res) => {
    res.json(storage.updateFinding(Number(req.params.fid), req.body ?? {}));
  });
  app.delete("/api/findings/:fid", (req, res) => {
    storage.deleteFinding(Number(req.params.fid));
    res.json({ ok: true });
  });

  return httpServer;
}
