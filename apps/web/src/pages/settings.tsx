import { Save, Settings2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  ErrorState,
  PageHeader,
  SkeletonRows,
} from "../components/ui";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { titleCase } from "../lib/format";

interface SettingRow {
  readonly setting_key: string;
  readonly value_text: string;
  readonly value_type: string;
}
interface SettingsPayload {
  readonly branch: Record<string, unknown>;
  readonly organization: Record<string, unknown>;
  readonly settings: readonly SettingRow[];
}
const groups = {
  business: [
    "business.name",
    "business.legal_name",
    "business.address",
    "business.phone",
    "business.whatsapp",
    "business.email",
    "business.tax_number",
    "business.currency",
    "business.working_hours",
    "business.timezone",
    "business.date_format",
    "business.number_format",
    "payment.default_method",
  ],
  invoice: [
    "invoice.prefix",
    "invoice.footer",
    "invoice.thank_you_message",
    "invoice.terms",
  ],
  tax: ["tax.enabled", "tax.rate_basis_points", "billing.rounding_mode"],
  location: [
    "location.latitude",
    "location.longitude",
    "location.allowed_radius_meters",
    "location.minimum_gps_accuracy_meters",
  ],
  referral: [
    "referral.enabled",
    "referral.friend_discount_type",
    "referral.friend_discount_value",
    "referral.reward_type",
    "referral.reward_value",
    "referral.minimum_bill_minor",
    "referral.maximum_discount_minor",
    "referral.reward_maximum_minor",
    "referral.reward_expiry_days",
    "referral.new_customers_only",
    "coupon.allow_referral_stacking",
  ],
  security: [
    "security.session_timeout_minutes",
    "privacy.photo_retention_days",
    "privacy.location_retention_days",
    "privacy.temporary_file_retention_days",
    "privacy.audit_retention_days",
    "privacy.login_attempt_retention_days",
  ],
} as const;
type Group = keyof typeof groups;
const numericKeys = new Set([
  "tax.rate_basis_points",
  "location.latitude",
  "location.longitude",
  "location.allowed_radius_meters",
  "location.minimum_gps_accuracy_meters",
  "referral.friend_discount_value",
  "referral.reward_value",
  "referral.minimum_bill_minor",
  "referral.maximum_discount_minor",
  "referral.reward_maximum_minor",
  "referral.reward_expiry_days",
  "security.session_timeout_minutes",
  "privacy.photo_retention_days",
  "privacy.location_retention_days",
  "privacy.temporary_file_retention_days",
  "privacy.audit_retention_days",
  "privacy.login_attempt_retention_days",
]);
const booleanKeys = new Set([
  "tax.enabled",
  "referral.enabled",
  "referral.new_customers_only",
  "coupon.allow_referral_stacking",
]);
export default function SettingsPage() {
  const state = useApiData<SettingsPayload>("/settings");
  const [group, setGroup] = useState<Group>("business");
  const toast = useToast();
  const values = useMemo(
    () =>
      new Map(
        state.data?.settings.map((item) => [
          item.setting_key,
          item.value_text,
        ]) ?? [],
      ),
    [state.data],
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const settings: Record<string, string | number | boolean> = {};
    for (const key of groups[group]) {
      const raw = form.get(key);
      if (booleanKeys.has(key)) settings[key] = raw === "on";
      else if (numericKeys.has(key)) settings[key] = Number(raw);
      else settings[key] = String(raw ?? "");
    }
    try {
      if (group === "business") {
        const logo = form.get("business.logo");
        if (logo instanceof File && logo.size > 0) {
          const upload = new FormData();
          upload.set("file", logo);
          settings["business.logo_asset_id"] = (
            await api<{ readonly id: string }>("/uploads/business-logo", {
              body: upload,
              method: "POST",
            })
          ).id;
        }
      }
      await api(`/settings/${group}`, {
        ...jsonBody({ settings }),
        method: "PATCH",
      });
      toast.success(`${titleCase(group)} settings saved and audited.`);
      state.reload();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Settings could not be saved.",
      );
    }
  }
  return (
    <>
      <PageHeader eyebrow="Administration" title="Business settings" />
      <div className="settings-layout">
        <Card className="settings-nav">
          {(Object.keys(groups) as Group[]).map((item) => (
            <button
              className={group === item ? "active" : ""}
              key={item}
              onClick={() => setGroup(item)}
              type="button"
            >
              <Settings2 size={17} /> {titleCase(item)}
            </button>
          ))}
        </Card>
        <Card>
          {state.loading ? (
            <SkeletonRows />
          ) : state.error !== null ? (
            <ErrorState message={state.error} onRetry={state.reload} />
          ) : (
            <form
              className="settings-form"
              key={`${group}-${state.data?.settings.length ?? 0}`}
              onSubmit={(event) => void submit(event)}
            >
              <div>
                <p className="eyebrow">Configuration group</p>
                <h2>{titleCase(group)}</h2>
                <p className="muted">
                  Changes apply prospectively. Existing financial and invoice
                  snapshots remain unchanged.
                </p>
              </div>
              {group === "business" ? (
                <label>
                  <span>Business logo (PNG or JPEG, private)</span>
                  <input
                    accept="image/png,image/jpeg"
                    name="business.logo"
                    type="file"
                  />
                </label>
              ) : null}
              <div className="form-grid">
                {groups[group].map((key) =>
                  booleanKeys.has(key) ? (
                    <label className="toggle-row" key={key}>
                      <input
                        defaultChecked={values.get(key) === "true"}
                        name={key}
                        type="checkbox"
                      />
                      <span>
                        <strong>
                          {titleCase(key.split(".").at(-1) ?? key)}
                        </strong>
                        <small>{key}</small>
                      </span>
                    </label>
                  ) : (
                    <label key={key}>
                      <span>{titleCase(key.split(".").at(-1) ?? key)}</span>
                      <input
                        defaultValue={values.get(key) ?? ""}
                        name={key}
                        step={
                          key.includes("latitude") || key.includes("longitude")
                            ? "any"
                            : "1"
                        }
                        type={
                          numericKeys.has(key)
                            ? "number"
                            : key.includes("email")
                              ? "email"
                              : "text"
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <Button type="submit">
                <Save size={17} /> Save {group}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
