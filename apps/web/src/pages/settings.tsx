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
import { formatCurrencyCode, titleCase } from "../lib/format";

const supportedCurrencies = new Set(
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : ["AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD","BIF","BMD","BND","BOB","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHF","CLP","CNY","COP","CRC","CUP","CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","FOK","GBP","GEL","GGP","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK","HTG","HUF","IDR","ILS","IMP","INR","IQD","IRR","ISK","JEP","JMD","JOD","JPY","KES","KGS","KHR","KID","KMF","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MYR","MZN","NAD","NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SYP","SZL","THB","TJS","TMT","TND","TOP","TRY","TTD","TVD","TWD","TZS","UAH","UGX","USD","UYU","UZS","VES","VND","VUV","WST","XAF","XCD","XOF","XPF","YER","ZAR","ZMW","ZWG"],
);

function isValidCurrency(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length === 0) return "Enter a currency code.";
  if (!/^[A-Z]{3}$/.test(trimmed)) return "Enter a valid three-letter currency code, for example INR.";
  if (!supportedCurrencies.has(trimmed)) return `"${trimmed}" is not a supported currency code.`;
  return null;
}

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
    "payment.allow_refunds",
  ],
  invoice: [
    "invoice.prefix",
    "invoice.footer",
    "invoice.thank_you_message",
    "invoice.terms",
  ],
  tax: ["tax.enabled", "tax.rate_basis_points", "billing.rounding_mode"],
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
  "payment.allow_refunds",
]);
export default function SettingsPage() {
  const state = useApiData<SettingsPayload>("/settings");
  const [group, setGroup] = useState<Group>("business");
  const toast = useToast();
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [currencyInput, setCurrencyInput] = useState<string>("");
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
      const formValue = form.get(key);
      if (key === "business.currency") {
        const raw = String(formValue ?? "");
        const error = isValidCurrency(raw);
        if (error !== null) { setCurrencyError(error); return; }
        settings[key] = raw.trim().toUpperCase();
      } else if (booleanKeys.has(key)) settings[key] = formValue === "on";
      else if (numericKeys.has(key)) settings[key] = Number(formValue);
      else settings[key] = String(formValue ?? "");
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
      setCurrencyError(null);
      setCurrencyInput("");
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
                        {key === "payment.allow_refunds" && (
                          <span className="muted" style={{ display: "block", marginTop: "0.25rem" }}>
                            Enables or disables payment refunds across the organization. When disabled, refund buttons
                            are hidden and refund API requests are rejected.
                          </span>
                        )}
                      </span>
                    </label>
                  ) : key === "business.currency" ? (
                    <div className="field-group" key={key}>
                      <label>
                        <span>Currency code</span>
                        <input
                          defaultValue={values.get(key) ?? ""}
                          maxLength={3}
                          name={key}
                          onChange={(e) => {
                            const upper = e.target.value.toUpperCase();
                            e.target.value = upper;
                            setCurrencyInput(upper);
                            const err = isValidCurrency(upper);
                            setCurrencyError(err);
                          }}
                          placeholder="INR"
                          type="text"
                        />
                        {currencyError ? <span className="field-error">{currencyError}{currencyError.includes("₹") ? " Use INR for Indian Rupees." : ""}</span> : null}
                      </label>
                      <p className="muted" style={{ margin: "0.25rem 0 0" }}>Use a three-letter currency code such as INR, USD, AED, or EUR.</p>
                      {(() => {
                        const live = currencyInput || (values.get(key) ?? "");
                        const err = isValidCurrency(live);
                        if (err === null) {
                          return <p className="muted" style={{ margin: "0.25rem 0 0" }}>Currency preview: {formatCurrencyCode(live)}</p>;
                        }
                        if (live !== "" && live !== "₹") return <p className="muted" style={{ margin: "0.25rem 0 0" }}>Preview unavailable — invalid code.</p>;
                        return null;
                      })()}
                    </div>
                  ) : (
                    <label key={key}>
                      <span>{titleCase(key.split(".").at(-1) ?? key)}</span>
                      <input
                        defaultValue={values.get(key) ?? ""}
                        name={key}
                        step="1"
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
