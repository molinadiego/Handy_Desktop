export type ClientType = "direct" | "property_manager";
export type View = "dashboard" | "requests" | "clients" | "properties";

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

export interface WorkRequest {
  id: string;
  client_type: ClientType;
  contact_name: string;
  contact_phone: string;
  tenant_name: string | null;
  address_line1: string;
  city: string;
  subdivision: string | null;
  description: string;
  preferred_at: string | null;
  status: "received" | "reviewing" | "quoted" | "cancelled";
  created_at: string;
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

export interface RequestInput {
  clientId?: string;
  propertyId?: string;
  clientType: ClientType;
  contactName: string;
  contactPhone: string;
  tenantName: string;
  tenantPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  subdivision: string;
  postalCode: string;
  description: string;
  preferredAt: string;
}
