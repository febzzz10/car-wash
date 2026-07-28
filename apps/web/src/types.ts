export interface AuthUser {
  readonly branchId: string | null;
  readonly fullName: string;
  readonly id: string;
  readonly permissions: readonly string[];
  readonly role: "ADMIN" | "STAFF";
  readonly username: string | undefined;
}

export interface CustomerRecord {
  readonly id: string;
  readonly customer_code?: string | null;
  readonly full_name: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly status: string;
  readonly total_visits_cached: number;
  readonly total_spent_minor_cached: number;
  readonly last_visit_at?: string | null;
  readonly version: number;
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
