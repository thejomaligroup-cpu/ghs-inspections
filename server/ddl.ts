export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS \`custody\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`inspection_id\` integer NOT NULL,
	\`lab_name\` text DEFAULT '' NOT NULL,
	\`lab_address\` text DEFAULT '' NOT NULL,
	\`lab_contact\` text DEFAULT '' NOT NULL,
	\`turnaround\` text DEFAULT 'Standard (3-5 day)' NOT NULL,
	\`relinquished_by\` text DEFAULT '' NOT NULL,
	\`relinquished_date\` text DEFAULT '' NOT NULL,
	\`ship_method\` text DEFAULT '' NOT NULL,
	\`tracking_number\` text DEFAULT '' NOT NULL,
	\`received_by\` text DEFAULT '' NOT NULL,
	\`received_date\` text DEFAULT '' NOT NULL,
	\`seal_intact\` text DEFAULT 'Yes' NOT NULL,
	\`cooler_temp\` text DEFAULT '' NOT NULL,
	\`remarks\` text DEFAULT '' NOT NULL
);
CREATE TABLE IF NOT EXISTS \`findings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`inspection_id\` integer NOT NULL,
	\`room\` text DEFAULT '' NOT NULL,
	\`observation\` text DEFAULT '' NOT NULL,
	\`affected_material\` text DEFAULT '' NOT NULL,
	\`estimated_area\` text DEFAULT '' NOT NULL,
	\`condition_class\` text DEFAULT 'Condition 1' NOT NULL,
	\`mold_growth\` text DEFAULT 'Suspect' NOT NULL,
	\`moisture_source\` text DEFAULT '' NOT NULL,
	\`recommendation\` text DEFAULT '' NOT NULL,
	\`photo\` text DEFAULT '' NOT NULL,
	\`photo_caption\` text DEFAULT '' NOT NULL
);
CREATE TABLE IF NOT EXISTS \`inspections\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`job_number\` text DEFAULT '' NOT NULL,
	\`inspection_date\` text DEFAULT '' NOT NULL,
	\`status\` text DEFAULT 'In Progress' NOT NULL,
	\`client_name\` text DEFAULT '' NOT NULL,
	\`client_phone\` text DEFAULT '' NOT NULL,
	\`client_email\` text DEFAULT '' NOT NULL,
	\`property_address\` text DEFAULT '' NOT NULL,
	\`property_city\` text DEFAULT '' NOT NULL,
	\`property_state\` text DEFAULT 'NY' NOT NULL,
	\`property_zip\` text DEFAULT '' NOT NULL,
	\`property_type\` text DEFAULT 'Single Family' NOT NULL,
	\`year_built\` text DEFAULT '' NOT NULL,
	\`square_feet\` text DEFAULT '' NOT NULL,
	\`occupied\` text DEFAULT 'Yes' NOT NULL,
	\`hvac_type\` text DEFAULT '' NOT NULL,
	\`reason_for_inspection\` text DEFAULT '' NOT NULL,
	\`scope\` text DEFAULT '' NOT NULL,
	\`occupant_concerns\` text DEFAULT '' NOT NULL,
	\`water_history\` text DEFAULT '' NOT NULL,
	\`inspector_name\` text DEFAULT '' NOT NULL,
	\`inspector_cert\` text DEFAULT '' NOT NULL,
	\`company_name\` text DEFAULT '' NOT NULL,
	\`outdoor_temp\` text DEFAULT '' NOT NULL,
	\`outdoor_rh\` text DEFAULT '' NOT NULL,
	\`weather\` text DEFAULT '' NOT NULL,
	\`summary\` text DEFAULT '' NOT NULL,
	\`recommendations\` text DEFAULT '' NOT NULL,
	\`limitations\` text DEFAULT '' NOT NULL
, \`owner_id\` integer, \`owner_name\` text DEFAULT '' NOT NULL, \`last_edited_by\` text DEFAULT '' NOT NULL, \`last_edited_at\` text DEFAULT '' NOT NULL, \`exported_at\` text DEFAULT '' NOT NULL, \`exported_by\` text DEFAULT '' NOT NULL, \`exported_to\` text DEFAULT '' NOT NULL);
CREATE TABLE IF NOT EXISTS \`readings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`inspection_id\` integer NOT NULL,
	\`room\` text DEFAULT '' NOT NULL,
	\`material\` text DEFAULT '' NOT NULL,
	\`meter_type\` text DEFAULT 'Pin' NOT NULL,
	\`moisture\` real,
	\`dry_standard\` real,
	\`temp_f\` real,
	\`rh\` real,
	\`surface_temp_f\` real,
	\`notes\` text DEFAULT '' NOT NULL
);
CREATE TABLE IF NOT EXISTS \`samples\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`inspection_id\` integer NOT NULL,
	\`sample_id\` text DEFAULT '' NOT NULL,
	\`sample_type\` text DEFAULT 'Indoor Air' NOT NULL,
	\`location\` text DEFAULT '' NOT NULL,
	\`cassette_type\` text DEFAULT 'Spore Trap' NOT NULL,
	\`cassette_lot\` text DEFAULT '' NOT NULL,
	\`pump_id\` text DEFAULT '' NOT NULL,
	\`cal_flow_lpm\` real,
	\`duration_min\` real,
	\`start_time\` text DEFAULT '' NOT NULL,
	\`stop_time\` text DEFAULT '' NOT NULL,
	\`analysis_requested\` text DEFAULT 'Spore Trap Analysis' NOT NULL,
	\`notes\` text DEFAULT '' NOT NULL
, \`lab_report_no\` text DEFAULT '' NOT NULL, \`date_analyzed\` text DEFAULT '' NOT NULL, \`analyst\` text DEFAULT '' NOT NULL, \`result_notes\` text DEFAULT '' NOT NULL, \`results_received\` integer DEFAULT 0 NOT NULL);
CREATE TABLE IF NOT EXISTS \`lab_results\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`inspection_id\` integer NOT NULL,
	\`sample_row_id\` integer NOT NULL,
	\`organism\` text DEFAULT '' NOT NULL,
	\`raw_count\` real,
	\`per_m3_override\` real,
	\`notes\` text DEFAULT '' NOT NULL
);
CREATE TABLE IF NOT EXISTS \`inspectors\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`name\` text NOT NULL,
	\`pin\` text NOT NULL,
	\`role\` text DEFAULT 'inspector' NOT NULL,
	\`cert\` text DEFAULT '' NOT NULL,
	\`phone\` text DEFAULT '' NOT NULL,
	\`active\` integer DEFAULT 1 NOT NULL,
	\`created_at\` text DEFAULT '' NOT NULL
, \`sheet_id\` text DEFAULT '' NOT NULL, \`sheet_name\` text DEFAULT '' NOT NULL);
`;
