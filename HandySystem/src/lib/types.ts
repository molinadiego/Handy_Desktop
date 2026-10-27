export type ClientType = "direct" | "property_manager";
export type View = "dashboard" | "clients" | "properties" | "estimates" | "work_orders" | "schedule" | "follow_ups" | "expenses" | "staff_payments" | "billing" | "reports";
export type EstimateStatus = "draft" | "sent" | "accepted" | "expired" | "cancelled";
export type WorkOrderStatus = "pending" | "pending_approval" | "accepted" | "scheduled" | "in_progress" | "completed" | "cancelled";
export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";
export type ViewMode = "list" | "cards";

export interface WorkspaceViewPreferences {
  clients_view: ViewMode;
  properties_view: ViewMode;
  work_orders_view: ViewMode;
  estimates_view: ViewMode;
}

export interface WorkspaceRegionalSettings {
  country_code: string | null;
  subdivision: string | null;
  city: string | null;
  timezone: string;
}

export type EmailProvider = "gmail" | "microsoft";

export interface WorkspaceEmailSettings {
  gmail_oauth_client_id: string | null;
  microsoft_oauth_client_id: string | null;
  gmail_connected_email: string | null;
  microsoft_connected_email: string | null;
}

export interface FollowUpSettings {
  estimate_followup_days: number | null;
  appointment_confirmation_days: number | null;
  payment_followup_days: number | null;
}

export type FollowUpTaskType = "estimate_follow_up" | "appointment_confirmation" | "invoice_payment_follow_up";

export interface FollowUpTaskOverride {
  task_type: FollowUpTaskType;
  entity_id: string;
  due_at: string;
  status: "open" | "completed" | "dismissed";
}

export interface FollowUpSuggestion {
  id: string;
  task_type: FollowUpTaskType;
  entity_id: string;
  title: "estimateFollowUp" | "appointmentConfirmation" | "invoicePaymentFollowUp";
  recipient_name: string;
  address_line1: string;
  source_at: string;
  due_at: string;
  overdue: boolean;
  related_order_id: string | null;
  reference_code?: string;
  balance_minor?: number;
  currency_code?: string;
}

export interface Client {
  id: string;
  type: ClientType;
  name: string;
  company_name: string | null;
  phone: string;
  email: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  subdivision: string | null;
  postal_code: string | null;
  country_code: string | null;
  client_id: string | null;
  client_name: string | null;
  relationship_type: "owner" | "manager" | null;
  created_at: string;
}

export interface PropertyAssignmentHistory {
  client_id: string;
  client_name: string;
  relationship_type: "owner" | "manager";
  valid_from: string;
  valid_to: string | null;
}

export interface Estimate {
  id: string;
  work_order_id: string | null;
  client_id: string | null;
  property_id: string | null;
  client_type: ClientType;
  tenant_name: string | null;
  tenant_phone: string | null;
  current_version: number;
  version_id: string;
  version_number: number;
  status: EstimateStatus;
  pricing_complete: number;
  billing_mode: "fixed" | "time_materials";
  description: string;
  amount_minor: number;
  discount_kind: "amount" | "percent";
  discount_value: number;
  discount_minor: number;
  total_minor: number;
  currency_code: string;
  recipient_name: string;
  contact_name: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  subdivision: string | null;
  postal_code: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  items: string[];
}

export interface EstimateVersion {
  id: string;
  estimate_id: string;
  version_number: number;
  status: EstimateStatus;
  pricing_complete: number;
  billing_mode: "fixed" | "time_materials";
  description: string;
  amount_minor: number;
  discount_kind: "amount" | "percent";
  discount_value: number;
  discount_minor: number;
  total_minor: number;
  currency_code: string;
  recipient_name: string;
  contact_name: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  subdivision: string | null;
  postal_code: string | null;
  created_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  items: string[];
}

export interface EstimateDraftInput {
  items: string[];
  description: string;
  billingMode: "fixed" | "time_materials";
  amountMinor: number | null;
  discountKind: "amount" | "percent";
  discountValue: number;
  currencyCode: string;
}

export interface StandaloneEstimateDetails {
  clientId?: string | null;
  propertyId?: string | null;
  clientType: ClientType;
  recipientName: string;
  contactName: string;
  contactPhone: string;
  tenantName?: string;
  tenantPhone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  subdivision?: string;
  postalCode?: string;
}

export interface WorkOrder {
  id: string;
  estimate_id: string | null;
  estimate_status: EstimateStatus | null;
  estimate_version_id: string | null;
  client_id: string | null;
  property_id: string | null;
  client_type: ClientType;
  recipient_name: string;
  contact_name: string;
  contact_phone: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  subdivision: string | null;
  postal_code: string | null;
  description: string;
  billing_mode: "fixed" | "time_materials";
  agreed_amount_minor: number;
  price_confirmed: number;
  currency_code: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  access_instructions: string | null;
  lockbox_code: string | null;
  gate_code: string | null;
  scheduled_at: string | null;
  scheduled_end_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  items: string[];
  employee_ids: string[];
}

export interface Employee {
  id: string;
  name: string;
  color: string;
  worker_type: "employee" | "helper" | "subcontractor";
  created_at: string;
}

export interface CreateWorkOrderInput {
  items: string[];
  employeeIds: string[];
  clientId?: string | null;
  propertyId?: string | null;
  newClient?: {
    id: string;
    name: string;
    companyName?: string | null;
    phone: string;
    email?: string | null;
  } | null;
  newProperty?: {
    id: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    subdivision?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
  } | null;
  clientType?: ClientType;
  recipientName?: string;
  contactName?: string;
  contactPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  subdivision?: string;
  postalCode?: string;
  description?: string;
  billingMode?: "fixed" | "time_materials";
  amountMinor?: number;
  priceConfirmed: boolean;
  currencyCode?: string;
  scheduledAt: string;
  scheduledEndAt?: string;
  priority: WorkOrderPriority;
  accessInstructions: string;
  lockboxCode?: string;
  gateCode?: string;
}

export interface WorkOrderUpdateInput {
  items: string[];
  employeeIds: string[];
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  scheduledAt: string;
  scheduledEndAt: string;
  accessInstructions: string;
  lockboxCode: string;
  gateCode: string;
  clientType: ClientType;
  recipientName: string;
  contactName: string;
  contactPhone: string;
  tenantName: string;
  tenantPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  description: string;
  amountMinor: number | null;
  priceConfirmed: boolean;
  completedItems: string[] | null;
  cancellationReason: string;
  confirmCancellation: boolean;
}

export interface WorkOrderPhoto {
  id: string;
  file_name: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  data_url: string;
  created_at: string;
}

export interface WorkOrderNote {
  id: string;
  body: string;
  created_at: string;
}

export interface WorkTimeEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  entry_type: "hourly" | "per_job";
  started_at: string | null;
  ended_at: string | null;
  work_occurred_at: string;
  duration_minutes: number | null;
  amount_minor: number | null;
  currency_code: string | null;
  note: string | null;
  created_at: string;
}

export interface WorkOrderMaterial {
  id: string;
  material_name: string;
  quantity: number;
  total_cost_minor: number;
  unit_price_minor: number;
  currency_code: string;
  created_at: string;
}

export interface WorkOrderExtra {
  id: string;
  work_order_id: string;
  description: string;
  reason: string;
  amount_minor: number;
  currency_code: string;
  status: "pending_approval" | "approved" | "cancelled";
  created_at: string;
  approved_at: string | null;
  approval_method: "verbal" | "message" | "written" | "other" | null;
  approval_note: string | null;
  cancelled_at: string | null;
}

export type ExpenseCategory = "fixed" | "recurring" | "variable" | "travel" | "toll" | "fuel" | "parts" | "other";

export interface Expense {
  id: string;
  work_order_id: string | null;
  work_order_recipient: string | null;
  description: string;
  category: ExpenseCategory;
  occurred_at: string;
  amount_minor: number;
  currency_code: string;
  vendor: string | null;
  note: string | null;
  receipt_file_name: string | null;
  receipt_data_url: string | null;
  created_at: string;
}

export interface EmployeePayment {
  id: string;
  employee_id: string;
  employee_name: string;
  work_order_id: string | null;
  work_order_recipient: string | null;
  work_time_entry_id: string | null;
  amount_minor: number;
  currency_code: string;
  paid_at: string;
  note: string | null;
  created_at: string;
}

export interface PayableWorkCost {
  id: string;
  employee_id: string;
  employee_name: string;
  work_order_id: string;
  work_order_recipient: string;
  work_description: string;
  work_occurred_at: string;
  amount_minor: number;
  currency_code: string;
  paid_minor: number;
  remaining_minor: number;
}

export type InvoiceStatus = "draft" | "issued" | "voided";

export interface Invoice {
  id: string;
  work_order_id: string;
  reference_code: string;
  status: InvoiceStatus;
  recipient_name: string;
  contact_name: string;
  contact_phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  description: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency_code: string;
  tax_rate_basis_points: number | null;
  client_type: ClientType | null;
  recipient_email: string | null;
  created_at: string;
  issued_at: string | null;
  sent_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  paid_minor: number;
  reversed_payment_minor: number;
  balance_minor: number;
}

export interface CustomerPayment {
  id: string;
  paid_at: string;
  amount_minor: number;
  currency_code: string;
  client_type: ClientType | null;
  note: string | null;
  applied_minor: number;
  unapplied_minor: number;
}

export interface InvoicePaymentAllocationDraft {
  invoiceId: string;
  amountMinor: number;
}

export interface BackupStatus {
  configured: boolean;
  lastAutomaticBackupUnix: number | null;
}

export interface ClientInput {
  type: ClientType;
  name: string;
  companyName: string;
  phone: string;
  email: string;
}

export interface PropertyInput {
  clientId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  subdivision: string;
  postalCode: string;
  countryCode: string;
}
