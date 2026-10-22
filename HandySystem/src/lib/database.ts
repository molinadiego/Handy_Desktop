import Database from "@tauri-apps/plugin-sql";
import { isTauri } from "@tauri-apps/api/core";
import type {
  Client,
  ClientInput,
  Property,
  PropertyInput,
  RequestInput,
  WorkRequest,
} from "./types";

const WORKSPACE_ID = "local-workspace";
const DATABASE_URL = "sqlite:handyman.db";

let databasePromise: Promise<Database> | undefined;

export function isDesktopRuntime(): boolean {
  return isTauri();
}

async function database(): Promise<Database> {
  if (!isTauri()) {
    throw new Error("Abrí HandySystem como aplicación de escritorio para usar la base SQLite.");
  }
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

function now(): string {
  return new Date().toISOString();
}

export async function listClients(): Promise<Client[]> {
  const db = await database();
  return db.select<Client[]>(
    `SELECT id, type, name, company_name, phone, email, created_at
     FROM clients WHERE workspace_id = $1 ORDER BY name COLLATE NOCASE`,
    [WORKSPACE_ID],
  );
}

export async function createClient(input: ClientInput): Promise<void> {
  const db = await database();
  const timestamp = now();
  await db.execute(
    `INSERT INTO clients (id, workspace_id, type, name, company_name, phone, email, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      crypto.randomUUID(),
      WORKSPACE_ID,
      input.type,
      input.name.trim(),
      input.companyName.trim() || null,
      input.phone.trim(),
      input.email.trim() || null,
      timestamp,
    ],
  );
}

export async function listProperties(): Promise<Property[]> {
  const db = await database();
  return db.select<Property[]>(
    `SELECT p.id, p.address_line1, p.address_line2, p.city, p.subdivision,
            p.postal_code, p.country_code, p.created_at,
            h.client_id, c.name AS client_name, h.relationship_type
     FROM properties p
     LEFT JOIN property_client_history h
       ON h.property_id = p.id AND h.workspace_id = p.workspace_id AND h.valid_to IS NULL
     LEFT JOIN clients c ON c.id = h.client_id AND c.workspace_id = p.workspace_id
     WHERE p.workspace_id = $1
     ORDER BY p.created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function createProperty(input: PropertyInput, clientType: "direct" | "property_manager"): Promise<void> {
  const db = await database();
  const timestamp = now();
  const propertyId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO properties
       (id, workspace_id, address_line1, address_line2, city, subdivision, postal_code, country_code, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      propertyId,
      WORKSPACE_ID,
      input.addressLine1.trim(),
      input.addressLine2.trim() || null,
      input.city.trim(),
      input.subdivision.trim() || null,
      input.postalCode.trim() || null,
      input.countryCode.trim().toUpperCase() || null,
      timestamp,
    ],
  );
  await db.execute(
    `INSERT INTO property_client_history
       (id, workspace_id, property_id, client_id, relationship_type, valid_from)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      crypto.randomUUID(),
      WORKSPACE_ID,
      propertyId,
      input.clientId,
      clientType === "property_manager" ? "manager" : "owner",
      timestamp,
    ],
  );
}

export async function listRequests(): Promise<WorkRequest[]> {
  const db = await database();
  return db.select<WorkRequest[]>(
    `SELECT id, client_type, contact_name, contact_phone, tenant_name,
            address_line1, city, subdivision, description, preferred_at, status, created_at
     FROM requests WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function createRequest(input: RequestInput): Promise<void> {
  const db = await database();
  const timestamp = now();
  await db.execute(
    `INSERT INTO requests
       (id, workspace_id, client_id, property_id, client_type, contact_name, contact_phone, tenant_name, tenant_phone,
        address_line1, address_line2, city, subdivision, postal_code, description, preferred_at,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'received', $17, $17)`,
    [
      crypto.randomUUID(),
      WORKSPACE_ID,
      input.clientId || null,
      input.propertyId || null,
      input.clientType,
      input.contactName.trim(),
      input.contactPhone.trim(),
      input.tenantName.trim() || null,
      input.tenantPhone.trim() || null,
      input.addressLine1.trim(),
      input.addressLine2.trim() || null,
      input.city.trim(),
      input.subdivision.trim() || null,
      input.postalCode.trim() || null,
      input.description.trim(),
      input.preferredAt ? new Date(input.preferredAt).toISOString() : null,
      timestamp,
    ],
  );
}
