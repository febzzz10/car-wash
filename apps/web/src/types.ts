export interface AuthUser {
  readonly branchId: string | null;
  readonly fullName: string;
  readonly id: string;
  readonly permissions: readonly string[];
  readonly role: "ADMIN" | "STAFF";
  readonly username: string | undefined;
}

export interface CursorPagination {
  readonly hasNext: boolean;
  readonly limit: number;
  readonly nextCursor: string | null;
}

export interface InvoiceListPayload {
  readonly invoices: readonly InvoiceRecord[];
  readonly pagination: CursorPagination;
}

export interface PaymentListPayload {
  readonly payments: readonly PaymentRecord[];
  readonly pagination: CursorPagination;
}

export interface PaymentRecord {
  readonly amount_minor: number;
  readonly collected_by_name_snapshot?: string | null;
  readonly collected_by_employee_code_snapshot?: string | null;
  readonly created_at: string;
  readonly customer_name_snapshot: string;
  readonly external_transaction_reference?: string | null;
  readonly id: string;
  readonly job_reference: string;
  readonly paid_at: string;
  readonly payment_method: string;
  readonly payment_status: string;
  readonly status: string;
  readonly tip_minor: number;
  readonly vehicle_registration_snapshot: string;
  readonly wash_job_id: string;
}

export interface InvoiceRecord {
  readonly balance_minor: number;
  readonly created_at: string;
  readonly customer_name_snapshot: string;
  readonly id: string;
  readonly invoice_number: string;
  readonly invoice_status: string;
  readonly issued_at: string;
  readonly payment_status_snapshot: string;
  readonly revision_number: number;
  readonly total_minor: number;
  readonly vehicle_registration_snapshot: string;
}

export interface CustomerListPayload {
  readonly customers: readonly CustomerRecord[];
  readonly pagination: CursorPagination;
}

export interface CustomerRecord {
  readonly id: string;
  readonly customer_code?: string | null;
  readonly full_name: string;
  readonly phone: string;
  readonly phone_normalized: string;
  readonly email?: string | null;
  readonly status: string;
  readonly total_visits_cached: number;
  readonly total_spent_minor_cached: number;
  readonly last_visit_at?: string | null;
  readonly version: number;
  readonly matching_registrations?: readonly string[];
}

export interface VehicleListPayload {
  readonly vehicles: readonly VehicleRecord[];
  readonly pagination: CursorPagination;
}

export interface VehicleRecord {
  readonly id: string;
  readonly customer_id: string;
  readonly customer_name?: string;
  readonly registration_number: string;
  readonly colour?: string | null;
  readonly vehicle_type_id: string;
  readonly vehicle_type_name?: string;
  readonly vehicle_type_code: string;
  readonly make?: string | null;
  readonly model?: string | null;
  readonly manufacturing_year?: number | null;
  readonly fuel_type?: string | null;
  readonly notes?: string | null;
  readonly status: string;
  readonly version: number;
}

export interface WashJobRecord {
  readonly id: string;
  readonly job_reference: string;
  readonly customer_name_snapshot: string;
  readonly customer_phone_snapshot: string;
  readonly vehicle_registration_snapshot: string;
  readonly primary_service_name_snapshot: string;
  readonly status: string;
  readonly payment_status: string;
  readonly total_amount_minor: number;
  readonly paid_amount_minor: number;
  readonly balance_minor: number;
  readonly total_active_seconds: number;
  readonly started_at?: string | null;
  readonly paused_at?: string | null;
  readonly completed_at?: string | null;
  readonly assigned_user_name_snapshot?: string | null;
  readonly assigned_user_full_name?: string | null;
  readonly created_at: string;
  readonly version: number;
}

export interface ServiceRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly service_kind: "PRIMARY" | "ADD_ON";
  readonly base_price_minor: number;
  readonly estimated_duration_minutes?: number | null;
  readonly is_taxable: 0 | 1;
  readonly is_active: 0 | 1;
  readonly version: number;
}

export interface ServicePriceRecord {
  readonly id: string;
  readonly service_id: string;
  readonly vehicle_type_id: string;
  readonly vehicle_type_name?: string;
  readonly price_minor: number;
}

export interface VehicleTypeRecord {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}
