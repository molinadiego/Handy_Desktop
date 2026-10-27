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
  PropertyAssignmentHistory,
  CreateWorkOrderInput,
  WorkOrder,
  WorkOrderUpdateInput,
  WorkspaceRegionalSettings,
  WorkspaceEmailSettings,
  EmailProvider,
  StandaloneEstimateDetails,
  WorkspaceViewPreferences,
  WorkOrderPhoto,
  WorkOrderNote,
  Employee,
  WorkTimeEntry,
  FollowUpSettings,
  FollowUpTaskOverride,
  FollowUpTaskType,
  WorkOrderMaterial,
  Expense,
  ExpenseCategory,
  EmployeePayment,
  PayableWorkCost,
  Invoice,
  CustomerPayment,
  InvoicePaymentAllocationDraft,
  BackupStatus,
  WorkOrderExtra,
} from "./types";

const WORKSPACE_ID = "local-workspace";
const DATABASE_URL = "sqlite:handyman.db";

let databasePromise: Promise<Database> | undefined;
let localSessionToken = "";

export function setLocalSessionToken(token: string | null): void {
  localSessionToken = token ?? "";
}

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export type LocalAuthStatus = { setupRequired: boolean };
export type LocalSession = { token: string; username: string; role: string; canViewAccessCodes: boolean; employeeId: string | null };
export type LocalUserSummary = { id: string; username: string; canViewAccessCodes: boolean; active: boolean; employeeId: string | null; employeeName: string | null };
export type WorkOrderTaskAssignmentSummary = { employeeId: string; employeeName: string; status: string; assignedAt: string; completedAt: string | null; cancelledAt: string | null; cancellationReason: string | null };
export type WorkOrderTaskDraft = { id: string | null; description: string; employeeIds: string[]; assignmentHistory?: WorkOrderTaskAssignmentSummary[] };
export type AssignedWorkTask = {
  assignmentId: string;
  assignmentStatus: "assigned" | "completed" | "cancelled";
  assignedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  taskId: string;
  taskDescription: string;
  workOrderId: string;
  workOrderStatus: string;
  addressLine1: string;
  city: string;
  contactName: string;
  scheduledAt: string | null;
};

export function getLocalAuthStatus(): Promise<LocalAuthStatus> {
  return invoke("get_local_auth_status");
}

export function setupLocalAdmin(username: string, password: string): Promise<LocalSession> {
  return invoke("setup_local_admin", { input: { username, password } });
}

export function loginLocalUser(username: string, password: string): Promise<LocalSession> {
  return invoke("login_local_user", { input: { username, password } });
}

export function logoutLocalUser(token: string): Promise<void> {
  return invoke("logout_local_user", { token });
}

export function listLocalUsers(sessionToken: string): Promise<LocalUserSummary[]> {
  return invoke("list_local_users", { sessionToken });
}

export function createLocalUser(sessionToken: string, username: string, password: string, employeeId: string): Promise<void> {
  return invoke("create_local_user", { input: { sessionToken, username, password, employeeId } });
}

export function setLocalUserAccessPermission(sessionToken: string, userId: string, canViewAccessCodes: boolean): Promise<void> {
  return invoke("set_local_user_access_permission", { input: { sessionToken, userId, canViewAccessCodes } });
}

export function setLocalUserEmployee(sessionToken: string, userId: string, employeeId: string): Promise<void> {
  return invoke("set_local_user_employee", { input: { sessionToken, userId, employeeId } });
}

export function getWorkOrderAccessCodes(sessionToken: string, workOrderId: string): Promise<{ lockboxCode: string | null; gateCode: string | null }> {
  return invoke("get_work_order_access_codes", { input: { sessionToken, workOrderId } });
}

export function transitionAssignedWorkOrder(sessionToken: string, assignmentId: string, status: "completed" | "cancelled", cancellationReason?: string): Promise<void> {
  return invoke("transition_assigned_work_order", { input: { sessionToken, assignmentId, status, cancellationReason: cancellationReason ?? null } });
}

export function listMyAssignedTasks(sessionToken: string): Promise<AssignedWorkTask[]> {
  return invoke("list_my_assigned_tasks", { sessionToken });
}

export function listWorkOrderTasks(sessionToken: string, workOrderId: string): Promise<WorkOrderTaskDraft[]> {
  return invoke("list_work_order_tasks", { input: { sessionToken, workOrderId } });
}

export function saveWorkOrderTasks(sessionToken: string, workOrderId: string, tasks: WorkOrderTaskDraft[]): Promise<void> {
  return invoke("save_work_order_tasks", { input: { sessionToken, workOrderId, tasks } });
}

export function saveAssignedEstimateDraft(sessionToken: string, workOrderId: string, items: string[]): Promise<void> {
  return invoke("save_assigned_estimate_draft", { input: { sessionToken, workOrderId, items } });
}

async function database(): Promise<Database> {
  if (!isTauri()) {
    throw new Error("Abrí HandySystem como aplicación de escritorio para usar la base SQLite.");
  }
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

export async function initializeLocalDatabase(): Promise<void> {
  await database();
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

export async function listPropertyAssignmentHistory(propertyId: string): Promise<PropertyAssignmentHistory[]> {
  const db = await database();
  return db.select<PropertyAssignmentHistory[]>(
    `SELECT h.client_id, c.name AS client_name, h.relationship_type, h.valid_from, h.valid_to
     FROM property_client_history h
     JOIN clients c ON c.id = h.client_id AND c.workspace_id = h.workspace_id
     WHERE h.workspace_id = $1 AND h.property_id = $2
     ORDER BY h.valid_from DESC, h.id DESC`,
    [WORKSPACE_ID, propertyId],
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

export async function updateProperty(id: string, input: Omit<PropertyInput, "clientId">, relatedWorkOrderIds: string[] = [], newClientId?: string): Promise<void> {
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
      newClientId: newClientId || null,
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

export async function getWorkspaceInvoiceTaxRate(): Promise<number> {
  const db = await database();
  const rows = await db.select<{ invoice_tax_rate_basis_points: number }[]>(
    "SELECT invoice_tax_rate_basis_points FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0]?.invoice_tax_rate_basis_points ?? 0;
}

export async function setWorkspaceInvoiceTaxRate(rateBasisPoints: number): Promise<void> {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 10_000) {
    throw new Error("El impuesto debe ser un porcentaje entre 0 y 100.");
  }
  const db = await database();
  const result = await db.execute(
    "UPDATE workspaces SET invoice_tax_rate_basis_points = $1 WHERE id = $2",
    [rateBasisPoints, WORKSPACE_ID],
  );
  if (!result.rowsAffected) throw new Error("No se encontró el negocio para guardar el impuesto.");
}

export async function getWorkspaceEmailSettings(): Promise<WorkspaceEmailSettings> {
  const db = await database();
  const rows = await db.select<WorkspaceEmailSettings[]>(
    `SELECT gmail_oauth_client_id, microsoft_oauth_client_id,
            gmail_connected_email, microsoft_connected_email
     FROM workspaces WHERE id = $1 LIMIT 1`,
    [WORKSPACE_ID],
  );
  return rows[0] ?? {
    gmail_oauth_client_id: null,
    microsoft_oauth_client_id: null,
    gmail_connected_email: null,
    microsoft_connected_email: null,
  };
}

export async function setWorkspaceEmailClientIds(input: Pick<WorkspaceEmailSettings, "gmail_oauth_client_id" | "microsoft_oauth_client_id">): Promise<void> {
  for (const value of [input.gmail_oauth_client_id, input.microsoft_oauth_client_id]) {
    if (value !== null && value.length > 500) throw new Error("El Client ID no puede superar 500 caracteres.");
  }
  const db = await database();
  const result = await db.execute(
    `UPDATE workspaces
     SET gmail_oauth_client_id = $1, microsoft_oauth_client_id = $2
     WHERE id = $3`,
    [input.gmail_oauth_client_id?.trim() || null, input.microsoft_oauth_client_id?.trim() || null, WORKSPACE_ID],
  );
  if (!result.rowsAffected) throw new Error("No se encontró el negocio para guardar la configuración de email.");
}

export async function connectEmailProvider(provider: "gmail" | "microsoft", clientSecret?: string): Promise<string> {
  return invoke<string>("connect_email_provider", {
    input: { provider, clientSecret: clientSecret?.trim() || null },
  });
}

export async function disconnectEmailProvider(provider: "gmail" | "microsoft"): Promise<void> {
  await invoke("disconnect_email_provider", { provider });
}

export async function sendInvoiceEmail(input: {
  invoiceId: string;
  recipientEmail: string;
  provider: EmailProvider;
  pdfBase64: string;
}): Promise<void> {
  await invoke("send_invoice_email_command", { input });
}

export async function getWorkspaceName(): Promise<string> {
  const db = await database();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0]?.name ?? "Mi negocio";
}

export async function getWorkspaceRegionalSettings(): Promise<WorkspaceRegionalSettings> {
  const db = await database();
  const rows = await db.select<WorkspaceRegionalSettings[]>(
    "SELECT country_code, subdivision, city, timezone FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0] ?? { country_code: null, subdivision: null, city: null, timezone: "UTC" };
}

export async function getFollowUpSettings(): Promise<FollowUpSettings> {
  const db = await database();
  const rows = await db.select<FollowUpSettings[]>(
    "SELECT estimate_followup_days, appointment_confirmation_days, payment_followup_days FROM workspaces WHERE id = $1",
    [WORKSPACE_ID],
  );
  return {
    estimate_followup_days: rows[0]?.estimate_followup_days ?? 15,
    appointment_confirmation_days: rows[0]?.appointment_confirmation_days ?? 15,
    payment_followup_days: rows[0]?.payment_followup_days ?? 15,
  };
}

export async function setFollowUpSettings(settings: FollowUpSettings): Promise<void> {
  for (const value of [settings.estimate_followup_days, settings.appointment_confirmation_days, settings.payment_followup_days]) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 365)) {
      throw new Error("El plazo debe ser un número entero entre 1 y 365 días.");
    }
  }
  const db = await database();
  await db.execute(
    "UPDATE workspaces SET estimate_followup_days = $1, appointment_confirmation_days = $2, payment_followup_days = $3 WHERE id = $4",
    [settings.estimate_followup_days ?? 15, settings.appointment_confirmation_days ?? 15, settings.payment_followup_days ?? 15, WORKSPACE_ID],
  );
}

export async function listFollowUpTaskOverrides(): Promise<FollowUpTaskOverride[]> {
  const db = await database();
  return db.select<FollowUpTaskOverride[]>(
    "SELECT task_type, entity_id, due_at, status FROM follow_up_task_overrides WHERE workspace_id = $1",
    [WORKSPACE_ID],
  );
}

export async function saveFollowUpTask(input: {
  taskType: FollowUpTaskType;
  entityId: string;
  dueAt: string;
  status: FollowUpTaskOverride["status"];
}): Promise<void> {
  await invoke("save_follow_up_task", {
    input: { taskType: input.taskType, entityId: input.entityId, dueAt: input.dueAt, status: input.status },
  });
}

export async function setWorkspaceRegionalSettings(input: WorkspaceRegionalSettings): Promise<void> {
  const normalizedCountry = input.country_code?.trim().toUpperCase() || null;
  if (normalizedCountry && !/^[A-Z]{2}$/.test(normalizedCountry)) {
    throw new Error("El país debe ser un código ISO de dos letras (por ejemplo, US o AR).");
  }
  const timezone = input.timezone.trim();
  if (!timezone) throw new Error("Ingresa una zona horaria IANA, por ejemplo America/Argentina/Buenos_Aires.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("La zona horaria no es válida. Usa un identificador IANA, por ejemplo America/Chicago.");
  }
  const db = await database();
  const result = await db.execute(
    "UPDATE workspaces SET country_code = $1, subdivision = $2, city = $3, timezone = $4 WHERE id = $5",
    [normalizedCountry, input.subdivision?.trim() || null, input.city?.trim() || null, timezone, WORKSPACE_ID],
  );
  if (!result.rowsAffected) throw new Error("No se encontró el negocio para guardar su configuración regional.");
}

export async function getWorkspaceViewPreferences(): Promise<WorkspaceViewPreferences> {
  const db = await database();
  const rows = await db.select<WorkspaceViewPreferences[]>(
    "SELECT clients_view, properties_view, work_orders_view, estimates_view FROM workspaces WHERE id = $1 LIMIT 1",
    [WORKSPACE_ID],
  );
  return rows[0] ?? { clients_view: "list", properties_view: "cards", work_orders_view: "cards", estimates_view: "list" };
}

export async function setWorkspaceViewPreferences(input: WorkspaceViewPreferences): Promise<void> {
  const db = await database();
  for (const value of Object.values(input)) {
    if (value !== "list" && value !== "cards") throw new Error("El modo de vista debe ser lista o tarjetas.");
  }
  const result = await db.execute(
    `UPDATE workspaces
     SET clients_view = $1, properties_view = $2, work_orders_view = $3, estimates_view = $4
     WHERE id = $5`,
    [input.clients_view, input.properties_view, input.work_orders_view, input.estimates_view, WORKSPACE_ID],
  );
  if (!result.rowsAffected) throw new Error("No se encontró el negocio para guardar las vistas.");
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
  SELECT e.id, e.work_order_id, e.client_id, e.property_id, e.client_type, e.tenant_name, e.tenant_phone, e.current_version,
         v.id AS version_id, v.version_number, v.status, v.pricing_complete, v.billing_mode, v.description,
         v.amount_minor, v.discount_kind, v.discount_value, v.discount_minor, v.total_minor,
         v.currency_code, v.recipient_name, v.contact_name, v.contact_phone,
         v.address_line1, v.address_line2, v.city, v.subdivision, v.postal_code,
         v.created_at, v.sent_at, v.accepted_at
  FROM estimates e
  JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version
`;
const EMPLOYEE_ESTIMATE_SELECT = ESTIMATE_SELECT
  .replace("v.amount_minor, v.discount_kind, v.discount_value, v.discount_minor, v.total_minor,", "0 AS amount_minor, 'amount' AS discount_kind, 0 AS discount_value, 0 AS discount_minor, 0 AS total_minor,")
  .replace("v.currency_code, v.recipient_name", "'' AS currency_code, v.recipient_name");

export async function listEstimates(employeeId?: string | null): Promise<Estimate[]> {
  const db = await database();
  if (!employeeId) await db.execute(
    `UPDATE estimate_versions SET status = 'expired'
     WHERE workspace_id = $1 AND status = 'sent' AND sent_at IS NOT NULL
       AND datetime(sent_at, '+15 days') <= datetime('now')`,
    [WORKSPACE_ID],
  );
  const employeeScope = employeeId
    ? `AND v.status = 'draft' AND v.pricing_complete = 0 AND EXISTS (SELECT 1 FROM work_order_tasks t JOIN work_order_task_assignments a ON a.workspace_id = t.workspace_id AND a.task_id = t.id JOIN work_orders assigned_w ON assigned_w.id = t.work_order_id AND assigned_w.workspace_id = t.workspace_id WHERE t.work_order_id = e.work_order_id AND t.workspace_id = e.workspace_id AND t.active = 1 AND assigned_w.status NOT IN ('completed', 'cancelled') AND a.employee_id = $2 AND a.status = 'assigned')`
    : "";
  const projection = employeeId ? EMPLOYEE_ESTIMATE_SELECT : ESTIMATE_SELECT;
  const estimates = await db.select<Estimate[]>(`${projection} WHERE e.workspace_id = $1 ${employeeScope} ORDER BY e.created_at DESC`, employeeId ? [WORKSPACE_ID, employeeId] : [WORKSPACE_ID]);
  const itemRows = await db.select<{ estimate_version_id: string; description: string }[]>(
    `SELECT i.estimate_version_id, i.description FROM estimate_version_items i
     JOIN estimate_versions v ON v.id = i.estimate_version_id AND v.workspace_id = i.workspace_id
     JOIN estimates e ON e.id = v.estimate_id AND e.workspace_id = v.workspace_id
      WHERE e.workspace_id = $1 AND v.version_number = e.current_version ${employeeId ? "AND v.status = 'draft' AND v.pricing_complete = 0 AND EXISTS (SELECT 1 FROM work_order_tasks t JOIN work_order_task_assignments a ON a.workspace_id = t.workspace_id AND a.task_id = t.id JOIN work_orders assigned_w ON assigned_w.id = t.work_order_id AND assigned_w.workspace_id = t.workspace_id WHERE t.work_order_id = e.work_order_id AND t.workspace_id = e.workspace_id AND t.active = 1 AND assigned_w.status NOT IN ('completed', 'cancelled') AND a.employee_id = $2 AND a.status = 'assigned')" : ""} ORDER BY i.position`,
    employeeId ? [WORKSPACE_ID, employeeId] : [WORKSPACE_ID],
  );
  const byVersion = new Map<string, string[]>();
  for (const row of itemRows) byVersion.set(row.estimate_version_id, [...(byVersion.get(row.estimate_version_id) ?? []), row.description]);
  return estimates.map((estimate) => ({ ...estimate, items: byVersion.get(estimate.version_id) ?? estimate.description.split("\n").filter(Boolean) }));
}

export async function listEstimateVersions(estimateId: string): Promise<EstimateVersion[]> {
  const db = await database();
  const rows = await db.select<EstimateVersion[]>(
    `SELECT id, estimate_id, version_number, status, pricing_complete, billing_mode, description,
            amount_minor, discount_kind, discount_value, discount_minor, total_minor,
            currency_code, recipient_name, contact_name, contact_phone, address_line1,
            address_line2, city, subdivision, postal_code, created_at, sent_at, accepted_at
     FROM estimate_versions WHERE estimate_id = $1 AND workspace_id = $2
     ORDER BY version_number DESC`,
    [estimateId, WORKSPACE_ID],
  );
  const itemRows = await db.select<{ estimate_version_id: string; description: string }[]>(
    `SELECT i.estimate_version_id, i.description FROM estimate_version_items i
     JOIN estimate_versions v ON v.id = i.estimate_version_id AND v.workspace_id = i.workspace_id
     WHERE v.estimate_id = $1 AND v.workspace_id = $2 ORDER BY v.version_number DESC, i.position`,
    [estimateId, WORKSPACE_ID],
  );
  const byVersion = new Map<string, string[]>();
  for (const row of itemRows) byVersion.set(row.estimate_version_id, [...(byVersion.get(row.estimate_version_id) ?? []), row.description]);
  return rows.map((version) => ({ ...version, items: byVersion.get(version.id) ?? version.description.split("\n").filter(Boolean) }));
}

export async function createEstimateFromOrder(orderId: string, input: EstimateDraftInput): Promise<string> {
  return invoke<string>("create_estimate", { sessionToken: localSessionToken, input: { orderId, ...input } });
}

export async function createStandaloneEstimate(input: EstimateDraftInput, details: StandaloneEstimateDetails): Promise<string> {
  return invoke<string>("create_estimate", { sessionToken: localSessionToken, input: { orderId: null, ...details, ...input } });
}

export async function reviseEstimate(estimateId: string, input: EstimateDraftInput): Promise<number> {
  return invoke<number>("revise_estimate", { sessionToken: localSessionToken, input: { estimateId, ...input } });
}

export async function changeEstimateStatus(estimateId: string, status: Estimate["status"]): Promise<void> {
  await invoke("change_estimate_status", { sessionToken: localSessionToken, input: { estimateId, status } });
}

export async function listWorkOrders(employeeId?: string | null): Promise<WorkOrder[]> {
  const db = await database();
  const financialColumns = employeeId ? "0 AS agreed_amount_minor, '' AS currency_code, 0 AS price_confirmed" : "w.agreed_amount_minor, w.currency_code, w.price_confirmed";
  const employeeColumns = employeeId
    ? "'' AS contact_phone, NULL AS tenant_name, NULL AS tenant_phone, '' AS description, NULL AS access_instructions"
    : "w.contact_phone, w.tenant_name, w.tenant_phone, w.description, w.access_instructions";
  const orders = await db.select<WorkOrder[]>(
    `SELECT w.id, w.estimate_id, w.estimate_version_id, w.client_id, w.property_id, w.client_type, w.recipient_name,
            w.contact_name, ${employeeColumns}, w.address_line1, w.address_line2,
            w.city, w.subdivision, w.postal_code, w.billing_mode, ${financialColumns},
            w.status, w.priority, w.scheduled_at, w.started_at,
             NULL AS lockbox_code, NULL AS gate_code, w.scheduled_end_at, w.completed_at, w.cancelled_at, w.cancellation_reason, w.created_at,
            w.price_confirmed,
            ${employeeId ? "NULL" : "v.status"} AS estimate_status
     FROM work_orders w
     LEFT JOIN estimates e ON e.id = w.estimate_id AND e.workspace_id = w.workspace_id
     LEFT JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version
      WHERE w.workspace_id = $1 AND ($2 IS NULL OR (w.status NOT IN ('completed', 'cancelled') AND EXISTS (SELECT 1 FROM work_order_tasks scoped_t JOIN work_order_task_assignments scoped_a ON scoped_a.workspace_id = scoped_t.workspace_id AND scoped_a.task_id = scoped_t.id WHERE scoped_t.workspace_id = w.workspace_id AND scoped_t.work_order_id = w.id AND scoped_t.active = 1 AND scoped_a.employee_id = $2 AND scoped_a.status = 'assigned'))) ORDER BY COALESCE(w.scheduled_at, w.created_at) DESC`,
    [WORKSPACE_ID, employeeId ?? null],
  );
  const itemRows = await db.select<{ work_order_id: string; description: string }[]>(
    employeeId ? "SELECT work_order_id, description FROM work_order_items WHERE 1 = 0" : "SELECT work_order_id, description FROM work_order_items WHERE workspace_id = $1 ORDER BY work_order_id, position",
    employeeId ? [] : [WORKSPACE_ID],
  );
  const byOrder = new Map<string, string[]>();
  for (const row of itemRows) byOrder.set(row.work_order_id, [...(byOrder.get(row.work_order_id) ?? []), row.description]);
  const assignments = await db.select<{ work_order_id: string; employee_id: string }[]>(
    "SELECT work_order_id, employee_id FROM work_order_assignments WHERE workspace_id = $1 AND ($2 IS NULL OR employee_id = $2) ORDER BY work_order_id, employee_id",
    [WORKSPACE_ID, employeeId ?? null],
  );
  const employeesByOrder = new Map<string, string[]>();
  for (const row of assignments) employeesByOrder.set(row.work_order_id, [...(employeesByOrder.get(row.work_order_id) ?? []), row.employee_id]);
  return orders.map((order) => ({ ...order, items: byOrder.get(order.id) ?? order.description.split("\n").filter(Boolean), employee_ids: employeesByOrder.get(order.id) ?? [] }));
}

export async function listEmployees(): Promise<Employee[]> {
  const db = await database();
  return db.select<Employee[]>("SELECT id, name, color, worker_type, created_at FROM employees WHERE workspace_id = $1 ORDER BY name COLLATE NOCASE", [WORKSPACE_ID]);
}

export async function saveEmployee(employee: Pick<Employee, "id" | "name" | "color" | "worker_type">): Promise<void> {
  const db = await database();
  const name = employee.name.trim();
  if (!name) throw new Error("Ingresa el nombre del empleado.");
  const allowed = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#e11d48", "#7c3aed", "#475569", "#65a30d"];
  if (!allowed.includes(employee.color)) throw new Error("El color seleccionado no es válido.");
  await db.execute(
    `INSERT INTO employees (id, workspace_id, name, color, worker_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, worker_type = excluded.worker_type, updated_at = excluded.updated_at
     WHERE employees.workspace_id = excluded.workspace_id`,
    [employee.id, WORKSPACE_ID, name, employee.color, employee.worker_type, now()],
  );
}

export async function listWorkOrderPhotos(workOrderId: string): Promise<WorkOrderPhoto[]> {
  const db = await database();
  return db.select<WorkOrderPhoto[]>(
    `SELECT id, file_name, mime_type, size_bytes, data_url, created_at FROM work_order_photos
     WHERE workspace_id = $1 AND work_order_id = $2 ORDER BY created_at DESC`,
    [WORKSPACE_ID, workOrderId],
  );
}

export async function listWorkOrderNotes(workOrderId: string): Promise<WorkOrderNote[]> {
  const db = await database();
  return db.select<WorkOrderNote[]>(
    `SELECT id, body, created_at FROM work_order_notes
     WHERE workspace_id = $1 AND work_order_id = $2 ORDER BY created_at DESC`,
    [WORKSPACE_ID, workOrderId],
  );
}

export async function listWorkOrderCompletionItems(workOrderId: string): Promise<string[]> {
  const db = await database();
  const rows = await db.select<{ description: string }[]>(
    `SELECT description FROM work_order_completion_items
     WHERE workspace_id = $1 AND work_order_id = $2 ORDER BY position`,
    [WORKSPACE_ID, workOrderId],
  );
  return rows.map((row) => row.description);
}

export async function listWorkOrderMaterials(workOrderId: string): Promise<WorkOrderMaterial[]> {
  const db = await database();
  return db.select<WorkOrderMaterial[]>(
    `SELECT id, material_name, quantity, total_cost_minor, unit_price_minor, currency_code, created_at
     FROM work_order_materials WHERE workspace_id = $1 AND work_order_id = $2 ORDER BY created_at DESC`,
    [WORKSPACE_ID, workOrderId],
  );
}

export async function addWorkOrderMaterial(input: {
  workOrderId: string;
  materialName: string;
  quantity: number;
  totalCostMinor: number;
  unitPriceMinor: number;
}): Promise<void> {
  await invoke("create_work_order_material", {
    input: {
      workOrderId: input.workOrderId,
      materialName: input.materialName.trim(),
      quantity: input.quantity,
      totalCostMinor: input.totalCostMinor,
      unitPriceMinor: input.unitPriceMinor,
    },
  });
}

export async function listWorkOrderExtras(workOrderId: string): Promise<WorkOrderExtra[]> {
  const db = await database();
  return db.select<WorkOrderExtra[]>(
    `SELECT id, work_order_id, description, reason, amount_minor, currency_code, status,
            created_at, approved_at, approval_method, approval_note, cancelled_at
     FROM work_order_extras WHERE workspace_id = $1 AND work_order_id = $2 ORDER BY created_at`,
    [WORKSPACE_ID, workOrderId],
  );
}

export async function createWorkOrderExtra(input: {
  workOrderId: string;
  description: string;
  reason: string;
  amountMinor: number;
}): Promise<void> {
  await invoke("create_work_order_extra", { input: { ...input } });
}

export async function reviewWorkOrderExtra(input: {
  extraId: string;
  action: "approve" | "cancel";
  approvalMethod?: "verbal" | "message" | "written" | "other";
  approvalNote?: string;
}): Promise<void> {
  await invoke("review_work_order_extra", { input });
}

export async function listExpenses(): Promise<Expense[]> {
  const db = await database();
  return db.select<Expense[]>(
    `SELECT e.id, e.work_order_id, w.recipient_name AS work_order_recipient, e.description,
            e.category, e.occurred_at, e.amount_minor, e.currency_code, e.vendor, e.note,
            e.receipt_file_name, e.receipt_data_url, e.created_at
     FROM expenses e
     LEFT JOIN work_orders w ON w.id = e.work_order_id AND w.workspace_id = e.workspace_id
     WHERE e.workspace_id = $1 ORDER BY e.occurred_at DESC, e.created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function createExpense(input: {
  workOrderId?: string;
  description: string;
  category: ExpenseCategory;
  occurredAt: string;
  amountMinor: number;
  vendor: string;
  note: string;
  receipt?: File;
}): Promise<void> {
  let receiptDataUrl: string | null = null;
  if (input.receipt) {
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(input.receipt.type)) {
      throw new Error("El comprobante debe ser PDF, JPEG, PNG o WebP.");
    }
    if (input.receipt.size < 1 || input.receipt.size > 5 * 1024 * 1024) throw new Error("El comprobante debe ocupar como máximo 5 MiB.");
    receiptDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Formato de comprobante inválido."));
      reader.readAsDataURL(input.receipt!);
    });
  }
  await invoke("create_expense", {
    input: {
      workOrderId: input.workOrderId || null,
      description: input.description.trim(),
      category: input.category,
      occurredAt: input.occurredAt,
      amountMinor: input.amountMinor,
      vendor: input.vendor.trim() || null,
      note: input.note.trim() || null,
      receiptFileName: input.receipt?.name ?? null,
      receiptMimeType: input.receipt?.type ?? null,
      receiptSizeBytes: input.receipt?.size ?? null,
      receiptDataUrl,
    },
  });
}

export async function listEmployeePayments(): Promise<EmployeePayment[]> {
  const db = await database();
  return db.select<EmployeePayment[]>(
    `SELECT p.id, p.employee_id, e.name AS employee_name, p.work_order_id,
            w.recipient_name AS work_order_recipient, p.work_time_entry_id,
            p.amount_minor, p.currency_code, p.paid_at, p.note, p.created_at
     FROM employee_payments p
     JOIN employees e ON e.id = p.employee_id AND e.workspace_id = p.workspace_id
     LEFT JOIN work_orders w ON w.id = p.work_order_id AND w.workspace_id = p.workspace_id
     WHERE p.workspace_id = $1 ORDER BY p.paid_at DESC, p.created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function listPayableWorkCosts(): Promise<PayableWorkCost[]> {
  const db = await database();
  const rows = await db.select<Omit<PayableWorkCost, "remaining_minor">[]>(
    `SELECT t.id, t.employee_id, e.name AS employee_name, t.work_order_id,
            w.recipient_name AS work_order_recipient, w.description AS work_description,
            t.work_occurred_at, t.amount_minor, t.currency_code, COALESCE(SUM(p.amount_minor), 0) AS paid_minor
     FROM work_time_entries t
     JOIN employees e ON e.id = t.employee_id AND e.workspace_id = t.workspace_id
     JOIN work_orders w ON w.id = t.work_order_id AND w.workspace_id = t.workspace_id
     LEFT JOIN employee_payments p ON p.work_time_entry_id = t.id AND p.workspace_id = t.workspace_id
     WHERE t.workspace_id = $1 AND t.entry_type = 'per_job'
     GROUP BY t.id, e.name, w.recipient_name, w.description
     ORDER BY t.work_occurred_at DESC`,
    [WORKSPACE_ID],
  );
  return rows.map((row) => ({ ...row, remaining_minor: Math.max(0, row.amount_minor - row.paid_minor) }));
}

export async function createEmployeePayment(input: {
  employeeId: string;
  workOrderId?: string;
  workTimeEntryId?: string;
  paidAt: string;
  amountMinor: number;
  note: string;
}): Promise<void> {
  await invoke("create_employee_payment", {
    input: {
      employeeId: input.employeeId,
      workOrderId: input.workOrderId ?? null,
      workTimeEntryId: input.workTimeEntryId ?? null,
      paidAt: input.paidAt,
      amountMinor: input.amountMinor,
      note: input.note.trim() || null,
    },
  });
}

export async function listInvoices(): Promise<Invoice[]> {
  const db = await database();
  return db.select<Invoice[]>(
    `SELECT i.id, i.work_order_id, i.reference_code, i.status, i.recipient_name, i.contact_name,
            i.contact_phone, i.address_line1, i.address_line2, i.city, i.description,
            i.subtotal_minor, i.tax_minor, i.total_minor, i.currency_code,
            i.tax_rate_basis_points, i.client_type, i.recipient_email, i.created_at,
            i.issued_at, i.sent_at, i.voided_at, i.void_reason,
            COALESCE((SELECT SUM(a.amount_minor) FROM invoice_payment_allocations a
                      WHERE a.workspace_id = i.workspace_id AND a.invoice_id = i.id AND a.status = 'active'), 0) AS paid_minor,
            COALESCE((SELECT SUM(a.amount_minor) FROM invoice_payment_allocations a
                      WHERE a.workspace_id = i.workspace_id AND a.invoice_id = i.id AND a.status = 'reversed'), 0) AS reversed_payment_minor,
            CASE WHEN i.status = 'issued' THEN i.total_minor - COALESCE((
              SELECT SUM(a.amount_minor) FROM invoice_payment_allocations a
              WHERE a.workspace_id = i.workspace_id AND a.invoice_id = i.id AND a.status = 'active'), 0) ELSE 0 END AS balance_minor
     FROM invoices i WHERE i.workspace_id = $1 ORDER BY i.created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function listCustomerPayments(): Promise<CustomerPayment[]> {
  const db = await database();
  return db.select<CustomerPayment[]>(
    `SELECT p.id, p.paid_at, p.amount_minor, p.currency_code, p.note,
            CASE WHEN COUNT(DISTINCT w.client_type) = 1 THEN MAX(w.client_type) ELSE NULL END AS client_type,
            COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount_minor ELSE 0 END), 0) AS applied_minor,
            p.amount_minor - COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount_minor ELSE 0 END), 0) AS unapplied_minor
     FROM customer_payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id AND a.workspace_id = p.workspace_id AND a.status = 'active'
     LEFT JOIN invoices i ON i.id = a.invoice_id AND i.workspace_id = a.workspace_id
     LEFT JOIN work_orders w ON w.id = i.work_order_id AND w.workspace_id = i.workspace_id
     WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.paid_at DESC, p.created_at DESC`,
    [WORKSPACE_ID],
  );
}

export async function createInvoice(workOrderId: string): Promise<void> {
  await invoke("create_invoice", { input: { workOrderId } });
}

export async function issueInvoice(invoiceId: string): Promise<void> {
  await invoke("issue_invoice", { invoiceId });
}

export async function voidInvoice(invoiceId: string, reason: string): Promise<void> {
  await invoke("void_invoice", { input: { invoiceId, reason } });
}

export async function createCustomerPayment(input: {
  paidAt: string;
  amountMinor: number;
  currencyCode: string;
  note: string;
  allocations: InvoicePaymentAllocationDraft[];
}): Promise<void> {
  await invoke("create_customer_payment", { input: { ...input, note: input.note.trim() || null } });
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return invoke<BackupStatus>("get_backup_status");
}

export async function createDailyBackupIfDue(): Promise<number | null> {
  return invoke<number | null>("create_daily_backup_if_due");
}

export async function configureBackups(password: string): Promise<string> {
  return invoke<string>("configure_backups", { input: { password } });
}

export async function revealBackupRecoveryCode(password: string): Promise<string> {
  return invoke<string>("reveal_backup_recovery_code", { input: { password } });
}

export async function exportEncryptedBackup(): Promise<string | null> {
  return invoke<string | null>("export_encrypted_backup_command");
}

export async function selectEncryptedBackupFile(): Promise<string | null> {
  return invoke<string | null>("select_encrypted_backup_file");
}

export async function closeDatabaseForRestore(): Promise<void> {
  if (!databasePromise) return;
  const db = await databasePromise;
  await db.close();
  databasePromise = undefined;
}

export async function restoreEncryptedBackup(backupPath: string, unlockSecret: string, newPassword: string): Promise<string> {
  return invoke<string>("restore_encrypted_backup_command", {
    input: { backupPath, unlockSecret, newPassword },
  });
}

export async function applyCustomerPayment(paymentId: string, allocations: InvoicePaymentAllocationDraft[]): Promise<void> {
  await invoke("apply_customer_payment", { input: { paymentId, allocations } });
}

export async function addWorkOrderNote(workOrderId: string, body: string): Promise<void> {
  const normalized = body.trim();
  if (!normalized) throw new Error("La nota no puede estar vacía.");
  const db = await database();
  await db.execute(
    `INSERT INTO work_order_notes (id, workspace_id, work_order_id, body, created_at)
     SELECT $1, $2, id, $4, $5 FROM work_orders WHERE id = $3 AND workspace_id = $2`,
    [crypto.randomUUID(), WORKSPACE_ID, workOrderId, normalized, now()],
  );
}

export async function addWorkOrderPhoto(workOrderId: string, file: File): Promise<void> {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Solo se permiten imágenes JPEG, PNG o WebP.");
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("La imagen debe ocupar como máximo 5 MiB.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Formato de imagen inválido."));
    reader.readAsDataURL(file);
  });
  const db = await database();
  await db.execute(
    `INSERT INTO work_order_photos (id, workspace_id, work_order_id, file_name, mime_type, size_bytes, data_url, created_at)
     SELECT $1, $2, id, $4, $5, $6, $7, $8 FROM work_orders WHERE id = $3 AND workspace_id = $2`,
    [crypto.randomUUID(), WORKSPACE_ID, workOrderId, file.name, file.type, file.size, dataUrl, now()],
  );
}

export async function listWorkTimeEntries(workOrderId: string): Promise<WorkTimeEntry[]> {
  const db = await database();
  return db.select<WorkTimeEntry[]>(
    `SELECT t.id, t.employee_id, e.name AS employee_name, t.entry_type, t.started_at, t.ended_at,
            t.work_occurred_at, t.duration_minutes, t.amount_minor, t.currency_code, t.note, t.created_at
     FROM work_time_entries t
     JOIN employees e ON e.id = t.employee_id AND e.workspace_id = t.workspace_id
     WHERE t.workspace_id = $1 AND t.work_order_id = $2 ORDER BY t.work_occurred_at DESC`,
    [WORKSPACE_ID, workOrderId],
  );
}

export async function addWorkTimeEntry(input: {
  entryType: "hourly" | "per_job";
  workOrderId: string;
  employeeId: string;
  startedAt?: string;
  endedAt?: string;
  workOccurredAt: string;
  amountMinor?: number;
  note: string;
}): Promise<void> {
  await invoke("create_work_time_entry", {
    input: {
      workOrderId: input.workOrderId,
      employeeId: input.employeeId,
      entryType: input.entryType,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      workOccurredAt: input.workOccurredAt,
      amountMinor: input.amountMinor ?? null,
      note: input.note.trim() || null,
    },
  });
}

export async function createWorkOrder(input: CreateWorkOrderInput, tasks: WorkOrderTaskDraft[] = []): Promise<string> {
  return invoke<string>("create_work_order", {
    sessionToken: localSessionToken,
    input: {
      ...input,
      taskDrafts: tasks,
      scheduledAt: input.scheduledAt || null,
      scheduledEndAt: input.scheduledEndAt || null,
      accessInstructions: input.accessInstructions || null,
      lockboxCode: input.lockboxCode?.trim() || null,
      gateCode: input.gateCode?.trim() || null,
    },
  });
}

export async function updateWorkOrder(id: string, input: WorkOrderUpdateInput, tasks: WorkOrderTaskDraft[] = []): Promise<void> {
  await invoke("update_work_order", {
    sessionToken: localSessionToken,
    input: {
      workOrderId: id,
      taskDrafts: tasks,
      items: input.items,
      employeeIds: input.employeeIds,
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
      amountMinor: input.amountMinor,
      priceConfirmed: input.priceConfirmed,
      completedItems: input.completedItems,
      cancellationReason: input.cancellationReason,
      confirmCancellation: input.confirmCancellation,
    },
  });
}
