export type ClientType = "direct" | "property_manager";
export type View = "dashboard" | "clients" | "properties" | "estimates" | "work_orders";
export type EstimateStatus = "draft" | "sent" | "accepted" | "expired" | "cancelled";
export type WorkOrderStatus = "pending" | "pending_approval" | "accepted" | "scheduled" | "in_progress" | "completed" | "cancelled";
export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

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

export interface Estimate {
  id: string;
  work_order_id: string | null;
  client_id: string | null;
  property_id: string | null;
  current_version: number;
  version_id: string;
  version_number: number;
  status: EstimateStatus;
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
}

export interface EstimateVersion {
  id: string;
  estimate_id: string;
  version_number: number;
  status: EstimateStatus;
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
}

export interface EstimateDraftInput {
  description: string;
  billingMode: "fixed" | "time_materials";
  amountMinor: number;
  discountKind: "amount" | "percent";
  discountValue: number;
  currencyCode: string;
}

export interface WorkOrder {
  id: string;
  estimate_id: string | null;
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
  created_at: string;
}

export interface CreateWorkOrderInput {
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
  currencyCode?: string;
  scheduledAt: string;
  scheduledEndAt?: string;
  priority: WorkOrderPriority;
  accessInstructions: string;
  lockboxCode?: string;
  gateCode?: string;
}

export interface WorkOrderUpdateInput {
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
