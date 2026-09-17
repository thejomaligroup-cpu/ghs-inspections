import {
  inspectors,
  inspections,
  readings,
  samples,
  custody,
  findings,
  labResults,
} from "@shared/schema";
import type {
  Inspector,
  InsertInspector,
  Inspection,
  InsertInspection,
  Reading,
  InsertReading,
  Sample,
  InsertSample,
  Custody,
  InsertCustody,
  Finding,
  InsertFinding,
  LabResult,
  InsertLabResult,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./ddl";
import { eq, desc } from "drizzle-orm";

import { mkdirSync } from "fs";
import { join } from "path";

const dataDir = process.env.DATA_DIR || ".";
if (dataDir !== ".") mkdirSync(dataDir, { recursive: true });
const dbFile = process.env.DATABASE_FILE || join(dataDir, "data.db");
const sqlite = new Database(dbFile);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(SCHEMA_SQL);

export const db = drizzle(sqlite);

export class DatabaseStorage {
  /* Team / inspectors */
  listInspectors(): Inspector[] {
    return db.select().from(inspectors).orderBy(inspectors.id).all();
  }
  getInspector(id: number): Inspector | undefined {
    return db.select().from(inspectors).where(eq(inspectors.id, id)).get();
  }
  findInspectorByName(name: string): Inspector | undefined {
    const wanted = name.trim().toLowerCase();
    return this.listInspectors().find((i) => i.name.trim().toLowerCase() === wanted);
  }
  createInspector(data: Partial<InsertInspector>): Inspector {
    return db
      .insert(inspectors)
      .values({ createdAt: new Date().toISOString(), ...data } as InsertInspector)
      .returning()
      .get();
  }
  updateInspector(id: number, data: Partial<InsertInspector>): Inspector | undefined {
    db.update(inspectors).set(data).where(eq(inspectors.id, id)).run();
    return this.getInspector(id);
  }

  /* Inspections */
  listInspections(): Inspection[] {
    return db.select().from(inspections).orderBy(desc(inspections.id)).all();
  }
  getInspection(id: number): Inspection | undefined {
    return db.select().from(inspections).where(eq(inspections.id, id)).get();
  }
  createInspection(data: Partial<InsertInspection>): Inspection {
    return db.insert(inspections).values(data as InsertInspection).returning().get();
  }
  updateInspection(id: number, data: Partial<InsertInspection>): Inspection | undefined {
    db.update(inspections).set(data).where(eq(inspections.id, id)).run();
    return this.getInspection(id);
  }
  stampInspection(id: number, actorName: string): void {
    if (!Number.isFinite(id)) return;
    db.update(inspections)
      .set({ lastEditedBy: actorName, lastEditedAt: new Date().toISOString() })
      .where(eq(inspections.id, id))
      .run();
  }
  deleteInspection(id: number): void {
    db.delete(readings).where(eq(readings.inspectionId, id)).run();
    db.delete(samples).where(eq(samples.inspectionId, id)).run();
    db.delete(labResults).where(eq(labResults.inspectionId, id)).run();
    db.delete(findings).where(eq(findings.inspectionId, id)).run();
    db.delete(custody).where(eq(custody.inspectionId, id)).run();
    db.delete(inspections).where(eq(inspections.id, id)).run();
  }

  /* Readings */
  listReadings(inspectionId: number): Reading[] {
    return db.select().from(readings).where(eq(readings.inspectionId, inspectionId)).all();
  }
  createReading(data: InsertReading): Reading {
    return db.insert(readings).values(data).returning().get();
  }
  updateReading(id: number, data: Partial<InsertReading>): Reading | undefined {
    db.update(readings).set(data).where(eq(readings.id, id)).run();
    return db.select().from(readings).where(eq(readings.id, id)).get();
  }
  deleteReading(id: number): void {
    db.delete(readings).where(eq(readings.id, id)).run();
  }

  /* Samples */
  listSamples(inspectionId: number): Sample[] {
    return db.select().from(samples).where(eq(samples.inspectionId, inspectionId)).all();
  }
  createSample(data: InsertSample): Sample {
    return db.insert(samples).values(data).returning().get();
  }
  updateSample(id: number, data: Partial<InsertSample>): Sample | undefined {
    db.update(samples).set(data).where(eq(samples.id, id)).run();
    return db.select().from(samples).where(eq(samples.id, id)).get();
  }
  deleteSample(id: number): void {
    db.delete(labResults).where(eq(labResults.sampleRowId, id)).run();
    db.delete(samples).where(eq(samples.id, id)).run();
  }

  /* Lab results */
  listLabResults(inspectionId: number): LabResult[] {
    return db.select().from(labResults).where(eq(labResults.inspectionId, inspectionId)).all();
  }
  createLabResult(data: InsertLabResult): LabResult {
    return db.insert(labResults).values(data).returning().get();
  }
  updateLabResult(id: number, data: Partial<InsertLabResult>): LabResult | undefined {
    db.update(labResults).set(data).where(eq(labResults.id, id)).run();
    return db.select().from(labResults).where(eq(labResults.id, id)).get();
  }
  deleteLabResult(id: number): void {
    db.delete(labResults).where(eq(labResults.id, id)).run();
  }

  /* Parent lookups for permission checks */
  inspectionIdForReading(id: number): number | undefined {
    return db.select().from(readings).where(eq(readings.id, id)).get()?.inspectionId;
  }
  inspectionIdForSample(id: number): number | undefined {
    return db.select().from(samples).where(eq(samples.id, id)).get()?.inspectionId;
  }
  inspectionIdForLabResult(id: number): number | undefined {
    return db.select().from(labResults).where(eq(labResults.id, id)).get()?.inspectionId;
  }
  inspectionIdForFinding(id: number): number | undefined {
    return db.select().from(findings).where(eq(findings.id, id)).get()?.inspectionId;
  }

  /* Custody */
  getCustody(inspectionId: number): Custody {
    const existing = db.select().from(custody).where(eq(custody.inspectionId, inspectionId)).get();
    if (existing) return existing;
    return db.insert(custody).values({ inspectionId } as InsertCustody).returning().get();
  }
  updateCustody(inspectionId: number, data: Partial<InsertCustody>): Custody {
    this.getCustody(inspectionId);
    db.update(custody).set(data).where(eq(custody.inspectionId, inspectionId)).run();
    return this.getCustody(inspectionId);
  }

  /* Findings */
  listFindings(inspectionId: number): Finding[] {
    return db.select().from(findings).where(eq(findings.inspectionId, inspectionId)).all();
  }
  createFinding(data: InsertFinding): Finding {
    return db.insert(findings).values(data).returning().get();
  }
  updateFinding(id: number, data: Partial<InsertFinding>): Finding | undefined {
    db.update(findings).set(data).where(eq(findings.id, id)).run();
    return db.select().from(findings).where(eq(findings.id, id)).get();
  }
  deleteFinding(id: number): void {
    db.delete(findings).where(eq(findings.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
