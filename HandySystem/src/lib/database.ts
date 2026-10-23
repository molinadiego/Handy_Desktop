import Database from "@tauri-apps/plugin-sql";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Client,
  ClientInput,
  Estimate,
  EstimateDraftInput,
  EstimateVersion,
  Property,
  PropertyInput,
  CreateWorkOrderInput,
  WorkOrder,
  WorkOrderUpdateInput,
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

export async function updateClient(id: string, input: ClientInput, relatedWorkOrderIds: string[] = []): Promise<void> {
  if (!isTauri()) throw new Error("Abrí HandySystem como aplicación de escritorio para corregir el cliente.");
  await invoke("correct_client_profile", {
    input: {
      clientId: id,
      name: input.name.trim(),
      companyName: input.companyName.trim() || null,
      phone: input.phone.trim(),
      email: input.email.trim() || null,
      relatedWorkOrderIds,
    },
  });
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

export async function updateProperty(id: string, input: Omit<PropertyInput, "clientId">, relatedWorkOrderIds: string[] = []): Promise<void> {
  if (!isTauri()) throw new Error("Abrí HandySystem como aplicación de escritorio para corregir la propiedad.");
  await invoke("correct_property_profile", {
    input: {
      propertyId: id,
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2.trim() || null,
      city: input.city.trim(),
      subdivision: input.subdivision.trim() || null,
      postalCode: input.postalCode.trim() || null,
      countryCode: input.countryCode.trim().toUpperCase() || null,
      relatedWorkOrderIds,
    },
  });
}

export async function getWorkspaceCurrency(): Promise<string | null> {
  const db = await database();
  const rows = await db.select<{ currency_code: string | null }[]>(
    "SELECT currency_code FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0]?.currency_code ?? null;
}

export async function getWorkspaceName(): Promise<string> {
  const db = await database();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0]?.name ?? "Mi negocio";
}

export async function getWorkspaceLanguage(): Promise<"es" | "en"> {
  const db = await database();
  const rows = await db.select<{ language_code: string }[]>(
    "SELECT language_code FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0]?.language_code === "en" ? "en" : "es";
}

export async function setWorkspaceLanguage(language: "es" | "en"): Promise<void> {
  const db = await database();
  await db.execute("UPDATE workspaces SET language_code = $1 WHERE id = $2", [language, WORKSPACE_ID]);
}

export async function setWorkspaceCurrency(currencyCode: string): Promise<void> {
  const db = await database();
  const normalized = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Código de moneda inválido.");
  const result = await db.execute("UPDATE workspaces SET currency_code = $1 WHERE id = $2", [normalized, WORKSPACE_ID]);
  if (result.rowsAffected === 0) throw new Error("No se encontró el negocio para actualizar su moneda.");
}

const ESTIMATE_SELECT = `
  SELECT e.id, e.work_order_id, e.client_id, e.property_id, e.current_version,
         v.id AS version_id, v.version_number, v.status, v.billing_mode, v.description,
         v.amount_minor, v.discount_kind, v.discount_value, v.discount_minor, v.total_minor,
         v.currency_code, v.recipient_name, v.contact_name, v.contact_phone,
         v.address_line1, v.address_line2, v.city, v.subdivision, v.postal_code,
         v.created_at, v.sent_at, v.accepted_at
  FROM estimates e
  JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version
`;

export async function listEstimates(): Promise<Estimate[]> {
  const db = await database();
  await db.execute(
    `UPDATE estimate_versions SET status = 'expired'
     WHERE workspace_id = $1 AND status = 'sent' AND sent_at IS NOT NULL
       AND datetime(sent_at, '+15 days') <= datetime('now')`,
    [WORKSPACE_ID],
  );
  return db.select<Estimate[]>(`${ESTIMATE_SELECT} WHERE e.workspace_id = $1 ORDER BY e.created_at DESC`, [WORKSPACE_ID]);
}

export async function listEstimateVersions(estimateId: string): Promise<EstimateVersion[]> {
  const db = await database();
  return db.select<EstimateVersion[]>(
    `SELECT id, estimate_id, version_number, status, billing_mode, description,
            amount_minor, discount_kind, discount_value, discount_minor, total_minor,
            currency_code, recipient_name, contact_name, contact_phone, address_line1,
            address_line2, city, subdivision, postal_code, created_at, sent_at, accepted_at
     FROM estimate_versions WHERE estimate_id = $1 AND workspace_id = $2
     ORDER BY version_number DESC`,
    [estimateId, WORKSPACE_ID],
  );
}

export async function createEstimateFromOrder(orderId: string, input: EstimateDraftInput): Promise<string> {
  return invoke<string>("create_estimate_from_order", { input: { orderId, ...input } });
}

export async function reviseEstimate(estimateId: string, input: EstimateDraftInput): Promise<number> {
  return invoke<number>("revise_estimate", { input: { estimateId, ...input } });
}

export async function changeEstimateStatus(estimateId: string, status: Estimate["status"]): Promise<void> {
  await invoke("change_estimate_status", { input: { estimateId, status } });
}

export async function listWorkOrders(): Promise<WorkOrder[]> {
  const db = await database();
  return db.select<WorkOrder[]>(
    `SELECT id, estimate_id, estimate_version_id, client_id, property_id, client_type, recipient_name,
            contact_name, contact_phone, tenant_name, tenant_phone, address_line1, address_line2,
            city, subdivision, postal_code, description, billing_mode, agreed_amount_minor,
            currency_code, status, priority, access_instructions, scheduled_at, started_at,
            lockbox_code, gate_code, scheduled_end_at, completed_at, cancelled_at, created_at
     FROM work_orders WHERE workspace_id = $1 ORDER BY COALESCE(scheduled_at, created_at) DESC`,
    [WORKSPACE_ID],
  );
}

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<string> {
  return invoke<string>("create_work_order", {
    input: {
      ...input,
      scheduledAt: input.scheduledAt || null,
      scheduledEndAt: input.scheduledEndAt || null,
      accessInstructions: input.accessInstructions || null,
    },
  });
}

export async function updateWorkOrder(id: string, input: WorkOrderUpdateInput): Promise<void> {
  await invoke("update_work_order", {
    input: {
      workOrderId: id,
      status: input.status,
      priority: input.priority,
      scheduledAt: input.scheduledAt || null,
      scheduledEndAt: input.scheduledEndAt || null,
      accessInstructions: input.accessInstructions || null,
      lockboxCode: input.lockboxCode || null,
      gateCode: input.gateCode || null,
      clientType: input.clientType,
      recipientName: input.recipientName,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      tenantName: input.tenantName || null,
      tenantPhone: input.tenantPhone || null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null,
      city: input.city,
      description: input.description,
    },
  });
}
