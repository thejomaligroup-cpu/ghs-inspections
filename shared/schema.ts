import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

/* ---------------- Inspectors (team) ---------------- */
export const inspectors = sqliteTable("inspectors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  pin: text("pin").notNull(),
  role: text("role").notNull().default("inspector"), // admin | inspector
  cert: text("cert").notNull().default(""),
  phone: text("phone").notNull().default(""),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(""),
  // Sales sheet this inspector's jobs are pushed to
  sheetId: text("sheet_id").notNull().default(""),
  sheetName: text("sheet_name").notNull().default(""),
});

/* ---------------- Inspections ---------------- */
export const inspections = sqliteTable("inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull().default(""),
  inspectionDate: text("inspection_date").notNull().default(""),
  status: text("status").notNull().default("In Progress"), // In Progress | Complete
  // Client
  clientName: text("client_name").notNull().default(""),
  clientPhone: text("client_phone").notNull().default(""),
  clientEmail: text("client_email").notNull().default(""),
  // Property
  propertyAddress: text("property_address").notNull().default(""),
  propertyCity: text("property_city").notNull().default(""),
  propertyState: text("property_state").notNull().default("NY"),
  propertyZip: text("property_zip").notNull().default(""),
  propertyType: text("property_type").notNull().default("Single Family"),
  yearBuilt: text("year_built").notNull().default(""),
  squareFeet: text("square_feet").notNull().default(""),
  occupied: text("occupied").notNull().default("Yes"),
  hvacType: text("hvac_type").notNull().default(""),
  // Scope / context
  reasonForInspection: text("reason_for_inspection").notNull().default(""),
  scope: text("scope").notNull().default(""),
  occupantConcerns: text("occupant_concerns").notNull().default(""),
  waterHistory: text("water_history").notNull().default(""),
  // Inspector
  inspectorName: text("inspector_name").notNull().default(""),
  inspectorCert: text("inspector_cert").notNull().default(""),
  companyName: text("company_name").notNull().default(""),
  // Conditions
  outdoorTemp: text("outdoor_temp").notNull().default(""),
  outdoorRh: text("outdoor_rh").notNull().default(""),
  weather: text("weather").notNull().default(""),
  // Wrap-up
  summary: text("summary").notNull().default(""),
  recommendations: text("recommendations").notNull().default(""),
  limitations: text("limitations").notNull().default(""),
  // Ownership / audit
  ownerId: integer("owner_id"),
  ownerName: text("owner_name").notNull().default(""),
  lastEditedBy: text("last_edited_by").notNull().default(""),
  lastEditedAt: text("last_edited_at").notNull().default(""),
  // Sales-sheet export audit
  exportedAt: text("exported_at").notNull().default(""),
  exportedBy: text("exported_by").notNull().default(""),
  exportedTo: text("exported_to").notNull().default(""),
});

/* ---------------- Moisture & thermal readings ---------------- */
export const readings = sqliteTable("readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  room: text("room").notNull().default(""),
  material: text("material").notNull().default(""),
  meterType: text("meter_type").notNull().default("Pin"), // Pin | Pinless | Thermo-hygrometer
  moisture: real("moisture"),
  dryStandard: real("dry_standard"),
  tempF: real("temp_f"),
  rh: real("rh"),
  surfaceTempF: real("surface_temp_f"),
  notes: text("notes").notNull().default(""),
});

/* ---------------- Air samples & chain of custody ---------------- */
export const samples = sqliteTable("samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  sampleId: text("sample_id").notNull().default(""),
  sampleType: text("sample_type").notNull().default("Indoor Air"), // Indoor Air | Outdoor Control | Wall Cavity | Surface Tape | Swab | Bulk
  location: text("location").notNull().default(""),
  cassetteType: text("cassette_type").notNull().default("Spore Trap"),
  cassetteLot: text("cassette_lot").notNull().default(""),
  pumpId: text("pump_id").notNull().default(""),
  calFlowLpm: real("cal_flow_lpm"),
  durationMin: real("duration_min"),
  startTime: text("start_time").notNull().default(""),
  stopTime: text("stop_time").notNull().default(""),
  analysisRequested: text("analysis_requested").notNull().default("Spore Trap Analysis"),
  notes: text("notes").notNull().default(""),
  // Returned lab data
  labReportNo: text("lab_report_no").notNull().default(""),
  dateAnalyzed: text("date_analyzed").notNull().default(""),
  analyst: text("analyst").notNull().default(""),
  resultNotes: text("result_notes").notNull().default(""),
  resultsReceived: integer("results_received").notNull().default(0),
});

/* ---------------- Lab results (spore counts per sample) ---------------- */
export const labResults = sqliteTable("lab_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  sampleRowId: integer("sample_row_id").notNull(),
  organism: text("organism").notNull().default(""),
  rawCount: real("raw_count"),
  perM3Override: real("per_m3_override"),
  notes: text("notes").notNull().default(""),
});

/* ---------------- Chain of custody (one per inspection) ---------------- */
export const custody = sqliteTable("custody", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  labName: text("lab_name").notNull().default(""),
  labAddress: text("lab_address").notNull().default(""),
  labContact: text("lab_contact").notNull().default(""),
  turnaround: text("turnaround").notNull().default("Standard (3-5 day)"),
  relinquishedBy: text("relinquished_by").notNull().default(""),
  relinquishedDate: text("relinquished_date").notNull().default(""),
  shipMethod: text("ship_method").notNull().default(""),
  trackingNumber: text("tracking_number").notNull().default(""),
  receivedBy: text("received_by").notNull().default(""),
  receivedDate: text("received_date").notNull().default(""),
  sealIntact: text("seal_intact").notNull().default("Yes"),
  coolerTemp: text("cooler_temp").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
});

/* ---------------- Visual findings ---------------- */
export const findings = sqliteTable("findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull(),
  room: text("room").notNull().default(""),
  observation: text("observation").notNull().default(""),
  affectedMaterial: text("affected_material").notNull().default(""),
  estimatedArea: text("estimated_area").notNull().default(""),
  conditionClass: text("condition_class").notNull().default("Condition 1"),
  moldGrowth: text("mold_growth").notNull().default("Suspect"), // None | Suspect | Visible | Confirmed
  moistureSource: text("moisture_source").notNull().default(""),
  recommendation: text("recommendation").notNull().default(""),
  photo: text("photo").notNull().default(""), // data URL
  photoCaption: text("photo_caption").notNull().default(""),
});

const omitId = { id: true } as const;
export const insertInspectorSchema = createInsertSchema(inspectors).omit(omitId);
export const insertInspectionSchema = createInsertSchema(inspections).omit(omitId);
export const insertReadingSchema = createInsertSchema(readings).omit(omitId);
export const insertSampleSchema = createInsertSchema(samples).omit(omitId);
export const insertLabResultSchema = createInsertSchema(labResults).omit(omitId);
export const insertCustodySchema = createInsertSchema(custody).omit(omitId);
export const insertFindingSchema = createInsertSchema(findings).omit(omitId);

export type InsertInspector = z.infer<typeof insertInspectorSchema>;
export type Inspector = typeof inspectors.$inferSelect;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspections.$inferSelect;
export type InsertReading = z.infer<typeof insertReadingSchema>;
export type Reading = typeof readings.$inferSelect;
export type InsertSample = z.infer<typeof insertSampleSchema>;
export type Sample = typeof samples.$inferSelect;
export type InsertLabResult = z.infer<typeof insertLabResultSchema>;
export type LabResult = typeof labResults.$inferSelect;
export type InsertCustody = z.infer<typeof insertCustodySchema>;
export type Custody = typeof custody.$inferSelect;
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findings.$inferSelect;
