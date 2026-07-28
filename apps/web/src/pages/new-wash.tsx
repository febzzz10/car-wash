import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  Plus,
  RotateCcw,
  Sparkles,
  VideoOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchField,
  SkeletonRows,
} from "../components/ui";
import VehicleMakeAutocomplete from "../components/vehicle-make-autocomplete";
import VehicleModelAutocomplete from "../components/vehicle-model-autocomplete";
import VehicleTypeSelect from "../components/vehicle-type-select";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { api, jsonBody } from "../lib/api";
import { money } from "../lib/format";
import {
  parseWizardDraft,
  serializeWizardDraft,
  WASH_DRAFT_STORAGE_KEY,
} from "../lib/wizard-draft";
import type {
  CustomerRecord,
  ServicePriceRecord,
  ServiceRecord,
  VehicleRecord,
  VehicleTypeRecord,
} from "../types";

const stepLabels = [
  "Customer",
  "Vehicle",
  "Live photo & location",
  "Services",
  "Benefits",
  "Assign",
  "Review",
] as const;
interface ServicePayload {
  readonly prices: readonly ServicePriceRecord[];
  readonly services: readonly ServiceRecord[];
  readonly vehicleTypes: readonly VehicleTypeRecord[];
}
interface StaffRecord {
  readonly id: string;
  readonly full_name: string;
  readonly role: string;
}
interface RewardRecord {
  readonly available_from?: string | null;
  readonly expires_at?: string | null;
  readonly id: string;
  readonly remaining_amount_minor: number;
}
interface Evidence {
  readonly photoAssetId?: string | undefined;
  readonly photoPreview?: string | undefined;
  readonly place?: string | undefined;
  readonly capturedAt?: string | undefined;
}

export default function NewWashPage() {
  const restored = useMemo(
    () => parseWizardDraft(sessionStorage.getItem(WASH_DRAFT_STORAGE_KEY)),
    [],
  );
  const [step, setStep] = useState(restored?.step ?? 0);
  const [customerId, setCustomerId] = useState(restored?.customerId ?? "");
  const [vehicleId, setVehicleId] = useState(restored?.vehicleId ?? "");
  const [primaryServiceId, setPrimaryServiceId] = useState(
    restored?.servicePriceId ?? "",
  );
  const [addOnServiceIds, setAddOnServiceIds] = useState<readonly string[]>(
    restored?.addOnServiceIds ?? [],
  );
  const [couponCode, setCouponCode] = useState(restored?.couponCode ?? "");
  const [referralCode, setReferralCode] = useState(
    restored?.referralCode ?? "",
  );
  const [rewardId, setRewardId] = useState(restored?.rewardId ?? "");
  const [rewardAmountMinor, setRewardAmountMinor] = useState(
    restored?.rewardUnits ?? 0,
  );
  const [manualDiscountMinor, setManualDiscountMinor] = useState(
    restored?.manualDiscountMinor ?? 0,
  );
  const [manualDiscountReason, setManualDiscountReason] = useState(
    restored?.manualDiscountReason ?? "",
  );
  const [assignedUserId, setAssignedUserId] = useState(
    restored?.assignedUserId ?? "",
  );
  const [startImmediately, setStartImmediately] = useState(
    restored?.startImmediately ?? false,
  );
  const [evidence, setEvidence] = useState<Evidence>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const customers = useApiData<readonly CustomerRecord[]>(
    `/customers?search=${encodeURIComponent(search)}`,
  );
  const rewards = useApiData<readonly RewardRecord[]>(
    `/customers/${customerId || "none"}/rewards`,
    customerId !== "",
  );
  const vehicles = useApiData<readonly VehicleRecord[]>("/vehicles");
  const services = useApiData<ServicePayload>("/services");
  const staff = useApiData<readonly StaffRecord[]>(
    "/wash-jobs/assignable-users",
  );
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const canApplyManualDiscount =
    user?.role === "ADMIN" || user?.permissions.includes("payments.adjust");

  useEffect(() => {
    sessionStorage.setItem(
      WASH_DRAFT_STORAGE_KEY,
      serializeWizardDraft({
        addOnServiceIds: [...addOnServiceIds],
        assignedUserId: assignedUserId || undefined,
        couponCode: couponCode || undefined,
        customerId: customerId || undefined,
        referralCode: referralCode || undefined,
        rewardId: rewardId || undefined,
        rewardUnits: rewardAmountMinor,
        manualDiscountMinor,
        manualDiscountReason: manualDiscountReason || undefined,
        servicePriceId: primaryServiceId || undefined,
        startImmediately,
        step,
        vehicleId: vehicleId || undefined,
      }),
    );
  }, [
    addOnServiceIds,
    assignedUserId,
    couponCode,
    customerId,
    primaryServiceId,
    referralCode,
    rewardAmountMinor,
    rewardId,
    manualDiscountMinor,
    manualDiscountReason,
    startImmediately,
    step,
    vehicleId,
  ]);

  const selectedCustomer = customers.data?.find(
    (item) => item.id === customerId,
  );
  const availableVehicles = (vehicles.data ?? []).filter(
    (item) => item.customer_id === customerId && item.status === "ACTIVE",
  );
  const selectedVehicle = availableVehicles.find(
    (item) => item.id === vehicleId,
  );
  const primaryServices = (services.data?.services ?? []).filter(
    (item) => item.service_kind === "PRIMARY",
  );
  const addOns = (services.data?.services ?? []).filter(
    (item) => item.service_kind === "ADD_ON",
  );
  const selectedPrimary = primaryServices.find(
    (item) => item.id === primaryServiceId,
  );
  const selectedAddOns = addOns.filter((item) =>
    addOnServiceIds.includes(item.id),
  );
  const estimate = useMemo(() => {
    if (selectedVehicle === undefined) return 0;
    const prices = services.data?.prices ?? [];
    const price = (service: ServiceRecord) =>
      prices.find(
        (item) =>
          item.service_id === service.id &&
          item.vehicle_type_id === selectedVehicle.vehicle_type_id,
      )?.price_minor ?? service.base_price_minor;
    return (
      (selectedPrimary === undefined ? 0 : price(selectedPrimary)) +
      selectedAddOns.reduce((sum, item) => sum + price(item), 0)
    );
  }, [selectedAddOns, selectedPrimary, selectedVehicle, services.data]);

  function canContinue(): boolean {
    return (
      [
        customerId !== "",
        vehicleId !== "",
        evidence.photoAssetId !== undefined,
        primaryServiceId !== "",
        (rewardId === "" || rewardAmountMinor > 0) &&
          (manualDiscountMinor === 0 ||
            manualDiscountReason.trim().length >= 5),
        assignedUserId !== "",
        true,
      ][step] ?? false
    );
  }

  async function createJob(
    requestedStatus?: "DRAFT" | "WAITING" | "IN_PROGRESS",
  ) {
    if (evidence.photoAssetId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api<{ readonly id: string }>("/wash-jobs", {
        ...jsonBody({
          addOnServiceIds,
          assignedUserId,
          couponCode: couponCode.trim() || undefined,
          customerId,
          idempotencyKey: crypto.randomUUID(),
          initialStatus:
            requestedStatus ?? (startImmediately ? "IN_PROGRESS" : "WAITING"),
          location: {
            place: evidence.place ?? "",
            capturedAt: evidence.capturedAt ?? new Date().toISOString(),
          },
          manualDiscountReason:
            manualDiscountMinor > 0 ? manualDiscountReason.trim() : undefined,
          manualDiscountMinor,
          photoAssetId: evidence.photoAssetId,
          primaryServiceId,
          referralCode: referralCode.trim() || undefined,
          rewardAmountMinor:
            rewardId === "" || rewardAmountMinor <= 0
              ? undefined
              : rewardAmountMinor,
          rewardId: rewardId || undefined,
          vehicleId,
        }),
        method: "POST",
      });
      sessionStorage.removeItem(WASH_DRAFT_STORAGE_KEY);
      toast.success(
        requestedStatus === "DRAFT"
          ? "Draft saved with its evidence and pricing snapshot."
          : "Wash job created and evidence linked securely.",
      );
      navigate(`/wash-jobs/${job.id}`, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The wash could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="New wash" title="Build a wash job" />
      <div aria-label="New Wash steps" className="stepper">
        {stepLabels.map((label, index) => (
          <button
            aria-current={step === index ? "step" : undefined}
            className={`${step === index ? "active" : ""} ${index < step ? "complete" : ""}`}
            key={label}
            onClick={() => {
              if (index <= step) setStep(index);
            }}
            type="button"
          >
            <span>{index < step ? <Check size={15} /> : index + 1}</span>
            <small>{label}</small>
          </button>
        ))}
      </div>
      <div className="wizard-layout">
        <Card className="wizard-panel">
          {error === null ? null : (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          {step === 0 ? (
            <SelectionStep
              heading="Who is this wash for?"
              intro="Search by customer name or phone. Phone numbers are normalized and checked for duplicates."
            >
              <div className="selection-toolbar">
                <SearchField
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or phone…"
                  value={search}
                />
                <Button
                  onClick={() => setCustomerDialog(true)}
                  tone="secondary"
                >
                  <Plus size={17} /> Add customer
                </Button>
              </div>
              {customers.loading ? (
                <SkeletonRows />
              ) : customers.error !== null ? (
                <ErrorState
                  message={customers.error}
                  onRetry={customers.reload}
                />
              ) : (
                <div className="choice-list">
                  {customers.data?.map((customer) => (
                    <Choice
                      active={customer.id === customerId}
                      key={customer.id}
                      onClick={() => {
                        setCustomerId(customer.id);
                        setVehicleId("");
                        setRewardId("");
                        setRewardAmountMinor(0);
                      }}
                      primary={customer.full_name}
                      secondary={`${customer.phone} · ${customer.total_visits_cached} visits`}
                    />
                  ))}
                </div>
              )}
            </SelectionStep>
          ) : null}
          {step === 1 ? (
            <SelectionStep
              heading="Select a vehicle"
              intro={`Active vehicles belonging to ${selectedCustomer?.full_name ?? "this customer"}.`}
            >
              <div className="selection-toolbar">
                <span />
                <Button onClick={() => setVehicleDialog(true)} tone="secondary">
                  <Plus size={17} /> Add vehicle
                </Button>
              </div>
              {vehicles.loading ? (
                <SkeletonRows />
              ) : availableVehicles.length === 0 ? (
                <EmptyState
                  action={
                    <Button onClick={() => setVehicleDialog(true)}>
                      Add their first vehicle
                    </Button>
                  }
                  icon={Plus}
                  message="A customer can own multiple vehicles."
                  title="No active vehicles"
                />
              ) : (
                <div className="choice-grid">
                  {availableVehicles.map((vehicle) => (
                    <Choice
                      active={vehicle.id === vehicleId}
                      key={vehicle.id}
                      onClick={() => setVehicleId(vehicle.id)}
                      primary={vehicle.registration_number}
                      secondary={`${vehicle.vehicle_type_name ?? "Vehicle"}${vehicle.make === null || vehicle.make === undefined ? "" : ` · ${vehicle.make} ${vehicle.model ?? ""}`}`}
                    />
                  ))}
                </div>
              )}
            </SelectionStep>
          ) : null}
          {step === 2 ? (
            <PhotoLocationStep evidence={evidence} onChange={setEvidence} />
          ) : null}
          {step === 3 ? (
            <SelectionStep
              heading="Choose services"
              intro="Select one primary service and any eligible add-ons. Final pricing, discounts, and tax are recalculated on the server."
            >
              {services.loading ? (
                <SkeletonRows />
              ) : (
                <>
                  <h3 className="field-section-title">Primary service</h3>
                  <div className="choice-grid">
                    {primaryServices.map((service) => (
                      <Choice
                        active={service.id === primaryServiceId}
                        key={service.id}
                        onClick={() => setPrimaryServiceId(service.id)}
                        primary={service.name}
                        secondary={`${service.estimated_duration_minutes ?? 0} min · from ${money(service.base_price_minor)}`}
                      />
                    ))}
                  </div>
                  <h3 className="field-section-title">Add-ons</h3>
                  <div className="choice-grid">
                    {addOns.map((service) => (
                      <Choice
                        active={addOnServiceIds.includes(service.id)}
                        key={service.id}
                        onClick={() =>
                          setAddOnServiceIds((current) =>
                            current.includes(service.id)
                              ? current.filter((id) => id !== service.id)
                              : [...current, service.id],
                          )
                        }
                        primary={service.name}
                        secondary={`from ${money(service.base_price_minor)}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </SelectionStep>
          ) : null}
          {step === 5 ? (
            <SelectionStep
              heading="Benefits and rewards"
              intro="Codes are checked for dates, limits, customer, vehicle, service, and stacking eligibility when the job is created."
            >
              <div className="form-grid">
                <label>
                  <span>Coupon code</span>
                  <div className="input-with-icon">
                    <Gift size={18} />
                    <input
                      autoCapitalize="characters"
                      onChange={(event) =>
                        setCouponCode(event.target.value.toUpperCase())
                      }
                      placeholder="Optional"
                      value={couponCode}
                    />
                  </div>
                </label>
                <label>
                  <span>Referral code</span>
                  <div className="input-with-icon">
                    <Sparkles size={18} />
                    <input
                      autoCapitalize="characters"
                      onChange={(event) =>
                        setReferralCode(event.target.value.toUpperCase())
                      }
                      placeholder="Optional"
                      value={referralCode}
                    />
                  </div>
                </label>
                <label>
                  <span>Available reward</span>
                  <select
                    onChange={(event) => {
                      const selected = rewards.data?.find(
                        (reward) => reward.id === event.target.value,
                      );
                      setRewardId(event.target.value);
                      setRewardAmountMinor(
                        selected?.remaining_amount_minor ?? 0,
                      );
                    }}
                    value={rewardId}
                  >
                    <option value="">Do not redeem a reward</option>
                    {rewards.data?.map((reward) => (
                      <option key={reward.id} value={reward.id}>
                        {money(reward.remaining_amount_minor)}
                        {reward.expires_at === null ||
                        reward.expires_at === undefined
                          ? ""
                          : ` · expires ${new Date(reward.expires_at).toLocaleDateString()}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Reward amount</span>
                  <input
                    disabled={rewardId === ""}
                    max={
                      (rewards.data?.find((item) => item.id === rewardId)
                        ?.remaining_amount_minor ?? 0) / 100
                    }
                    min="0.01"
                    onChange={(event) =>
                      setRewardAmountMinor(
                        Math.max(
                          0,
                          Math.round(Number(event.target.value) * 100),
                        ),
                      )
                    }
                    step="0.01"
                    type="number"
                    value={(rewardAmountMinor / 100).toString()}
                  />
                </label>
              </div>
              {canApplyManualDiscount ? (
                <div className="form-grid benefit-admin-fields">
                  <label>
                    <span>Manual discount</span>
                    <input
                      min="0"
                      onChange={(event) =>
                        setManualDiscountMinor(
                          Math.max(
                            0,
                            Math.round(Number(event.target.value) * 100),
                          ),
                        )
                      }
                      step="0.01"
                      type="number"
                      value={(manualDiscountMinor / 100).toString()}
                    />
                  </label>
                  <label>
                    <span>Manual discount reason</span>
                    <input
                      disabled={manualDiscountMinor === 0}
                      minLength={5}
                      onChange={(event) =>
                        setManualDiscountReason(event.target.value)
                      }
                      required={manualDiscountMinor > 0}
                      value={manualDiscountReason}
                    />
                  </label>
                </div>
              ) : null}
              <div className="info-panel">
                <strong>Server-verified benefits</strong>
                <p>
                  Invalid, expired, exhausted, duplicated, or ineligible
                  benefits are rejected without losing this form.
                </p>
              </div>
            </SelectionStep>
          ) : null}
          {step === 6 ? (
            <SelectionStep
              heading="Assign the wash"
              intro="Only active users at this branch are available."
            >
              {staff.loading ? (
                <SkeletonRows />
              ) : staff.error !== null ? (
                <ErrorState message={staff.error} onRetry={staff.reload} />
              ) : (
                <div className="choice-grid">
                  {staff.data?.map((person) => (
                    <Choice
                      active={person.id === assignedUserId}
                      key={person.id}
                      onClick={() => setAssignedUserId(person.id)}
                      primary={person.full_name}
                      secondary={
                        person.role === "ADMIN"
                          ? "Administrator"
                          : "Staff member"
                      }
                    />
                  ))}
                </div>
              )}
              <label className="toggle-row">
                <input
                  checked={startImmediately}
                  onChange={(event) =>
                    setStartImmediately(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <strong>Start immediately</strong>
                  <small>Otherwise the job enters Waiting.</small>
                </span>
              </label>
            </SelectionStep>
          ) : null}
          {step === 7 ? (
            <ReviewStep
              addOns={selectedAddOns}
              customer={selectedCustomer}
              estimate={estimate}
              enteredDiscountMinor={rewardAmountMinor + manualDiscountMinor}
              primary={selectedPrimary}
              startImmediately={startImmediately}
              vehicle={selectedVehicle}
            />
          ) : null}
          <div className="wizard-actions">
            <Button
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              tone="secondary"
            >
              <ChevronLeft size={18} /> Back
            </Button>
            {step < stepLabels.length - 1 ? (
              <Button
                disabled={!canContinue()}
                onClick={() =>
                  setStep((value) => Math.min(stepLabels.length - 1, value + 1))
                }
              >
                Continue <ChevronRight size={18} />
              </Button>
            ) : (
              <div className="button-row">
                <Button
                  busy={busy}
                  onClick={() => void createJob("DRAFT")}
                  tone="secondary"
                >
                  Save draft
                </Button>
                <Button busy={busy} onClick={() => void createJob()}>
                  Create {startImmediately ? "and start" : "waiting"} job
                </Button>
              </div>
            )}
          </div>
        </Card>
        <aside className="wizard-summary">
          <p className="eyebrow">Wash summary</p>
          <SummaryLine
            label="Customer"
            value={selectedCustomer?.full_name ?? "Not selected"}
          />
          <SummaryLine
            label="Vehicle"
            value={selectedVehicle?.registration_number ?? "Not selected"}
          />
          <SummaryLine
            label="Service"
            value={selectedPrimary?.name ?? "Not selected"}
          />
          <SummaryLine
            label="Add-ons"
            value={
              selectedAddOns.length === 0
                ? "None"
                : String(selectedAddOns.length)
            }
          />
          <div className="summary-total">
            <span>Current estimate</span>
            <strong>{money(estimate)}</strong>
            <small>Before benefits, tax, and rounding</small>
          </div>
          <div className="evidence-check">
            <span className={evidence.photoAssetId === undefined ? "" : "done"}>
              <Camera size={17} /> Live photo{" "}
              {evidence.photoAssetId === undefined ? "needed" : "captured"}
            </span>
            <span className={evidence.place === undefined ? "" : "done"}>
              <MapPin size={17} /> Place{" "}
              {evidence.place === undefined ? "optional" : "captured"}
            </span>
          </div>
        </aside>
      </div>
      <NewCustomerDialog
        onClose={() => setCustomerDialog(false)}
        onCreated={(customer) => {
          setCustomerId(customer.id);
          setCustomerDialog(false);
          customers.reload();
        }}
        open={customerDialog}
      />
      <NewVehicleDialog
        customerId={customerId}
        onClose={() => setVehicleDialog(false)}
        onCreated={(vehicle) => {
          setVehicleId(vehicle.id);
          setVehicleDialog(false);
          vehicles.reload();
        }}
        open={vehicleDialog}
      />
    </>
  );
}

function SelectionStep({
  children,
  heading,
  intro,
}: {
  readonly children: React.ReactNode;
  readonly heading: string;
  readonly intro: string;
}) {
  return (
    <div className="wizard-step">
      <p className="eyebrow">Step details</p>
      <h2>{heading}</h2>
      <p className="step-intro">{intro}</p>
      {children}
    </div>
  );
}
function Choice({
  active,
  onClick,
  primary,
  secondary,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly primary: string;
  readonly secondary: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={`choice-card ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="choice-check">
        {active ? <Check size={15} /> : null}
      </span>
      <span>
        <strong>{primary}</strong>
        <small>{secondary}</small>
      </span>
    </button>
  );
}
function SummaryLine({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=0`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { display_name?: string };
    return data.display_name?.slice(0, 500) ?? null;
  } catch {
    return null;
  }
}

function PhotoLocationStep({
  evidence,
  onChange,
}: {
  readonly evidence: Evidence;
  readonly onChange: (evidence: Evidence) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const photoDone = evidence.photoAssetId !== undefined;
  const locationDone = evidence.place !== undefined;
  useEffect(
    () => () => stream.current?.getTracks().forEach((track) => track.stop()),
    [],
  );
  async function start() {
    setCamBusy(true);
    setCamError(null);
    try {
      const result = await api<{ readonly nonce: string }>(
        "/uploads/photo-challenge",
        { method: "POST" },
      );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          height: { ideal: 1080 },
          width: { ideal: 1440 },
        },
      });
      stream.current = media;
      setChallenge(result.nonce);
      if (video.current !== null) {
        video.current.srcObject = media;
        await video.current.play();
      }
    } catch (reason) {
      setCamError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Camera access was denied. Allow camera permission in your browser settings, then retry."
          : reason instanceof Error
            ? reason.message
            : "The camera is unavailable.",
      );
    } finally {
      setCamBusy(false);
    }
  }
  async function capture() {
    if (video.current === null || challenge === null) return;
    setCamBusy(true);
    setCamError(null);
    try {
      const maxWidth = 1600;
      const ratio = Math.min(1, maxWidth / video.current.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.current.videoWidth * ratio));
      canvas.height = Math.max(
        1,
        Math.round(video.current.videoHeight * ratio),
      );
      canvas
        .getContext("2d")
        ?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value === null
              ? reject(new Error("Camera capture failed."))
              : resolve(value),
          "image/jpeg",
          0.82,
        ),
      );
      const form = new FormData();
      const capturedAt = new Date().toISOString();
      form.set("captureSource", "CAMERA");
      form.set("captureNonce", challenge);
      form.set("capturedAt", capturedAt);
      form.set("width", String(canvas.width));
      form.set("height", String(canvas.height));
      form.set(
        "file",
        new File([blob], `vehicle-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
      const uploaded = await api<{ readonly id: string }>("/uploads/photo", {
        body: form,
        method: "POST",
      });
      stream.current?.getTracks().forEach((track) => track.stop());
      onChange({
        ...evidence,
        photoAssetId: uploaded.id,
        photoPreview: URL.createObjectURL(blob),
      });
    } catch (reason) {
      setCamError(
        reason instanceof Error
          ? reason.message
          : "Photo upload failed. Retake and retry.",
      );
    } finally {
      setCamBusy(false);
    }
  }
  async function retake() {
    if (evidence.photoAssetId !== undefined)
      await api<undefined>(`/uploads/${evidence.photoAssetId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    if (evidence.photoPreview !== undefined)
      URL.revokeObjectURL(evidence.photoPreview);
    onChange({ ...evidence, photoAssetId: undefined, photoPreview: undefined });
    setChallenge(null);
  }
  async function captureLocation() {
    if (!("geolocation" in navigator)) {
      setLocError("Geolocation is not available in this browser.");
      return;
    }
    setLocBusy(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const place = await reverseGeocode(
          position.coords.latitude,
          position.coords.longitude,
        );
        onChange({
          ...evidence,
          place: place ?? `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
        setLocBusy(false);
      },
      (failure) => {
        setLocError(
          failure.code === failure.PERMISSION_DENIED
            ? "Location access was denied. Allow location permission, then retry."
            : "GPS could not get a reliable position. Move to an open area and retry.",
        );
        setLocBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }
  return (
    <SelectionStep
      heading="Capture photo & location"
      intro="Take a live rear-camera photo of the vehicle. Optionally capture the location to record a place name."
    >
      <div className="camera-stage">
        {evidence.photoPreview !== undefined ? (
          <img
            alt="Live vehicle capture preview"
            height="240"
            src={evidence.photoPreview}
            width="320"
          />
        ) : (
          <video muted playsInline ref={video} />
        )}
        {evidence.photoPreview === undefined && challenge === null ? (
          <div className="camera-placeholder">
            <VideoOff size={35} />
            <strong>Camera is off</strong>
            <span>Position the full vehicle inside the frame.</span>
          </div>
        ) : null}
      </div>
      {camError === null ? null : (
        <div className="form-alert" role="alert">
          {camError}
        </div>
      )}
      <div className="camera-actions">
        {photoDone ? (
          <Button onClick={() => void retake()} tone="secondary">
            <RotateCcw size={18} /> Retake photo
          </Button>
        ) : challenge === null ? (
          <Button busy={camBusy} onClick={() => void start()}>
            <Camera size={18} /> Allow camera
          </Button>
        ) : (
          <Button busy={camBusy} onClick={() => void capture()}>
            <Camera size={18} /> Capture live photo
          </Button>
        )}
      </div>
      {photoDone ? (
        <div className="location-capture-section">
          <hr />
          <h3>Location place</h3>
          {locationDone ? (
            <div className="location-captured-info">
              <MapPin size={18} />
              <span>{evidence.place}</span>
            </div>
          ) : (
            <p className="step-intro">
              Optionally capture your current location to record a readable place
              name instead of raw GPS coordinates.
            </p>
          )}
          {locError === null ? null : (
            <div className="form-alert" role="alert">
              {locError}
            </div>
          )}
          {!locationDone ? (
            <Button busy={locBusy} onClick={() => void captureLocation()}>
              <MapPin size={18} /> Capture place name
            </Button>
          ) : null}
        </div>
      ) : null}
    </SelectionStep>
  );
}

function ReviewStep({
  addOns,
  customer,
  estimate,
  enteredDiscountMinor,
  primary,
  startImmediately,
  vehicle,
}: {
  readonly addOns: readonly ServiceRecord[];
  readonly customer: CustomerRecord | undefined;
  readonly estimate: number;
  readonly enteredDiscountMinor: number;
  readonly primary: ServiceRecord | undefined;
  readonly startImmediately: boolean;
  readonly vehicle: VehicleRecord | undefined;
}) {
  return (
    <SelectionStep
      heading="Review and create"
      intro="The server will validate evidence, reserve benefits atomically, snapshot prices, and calculate the final bill."
    >
      <div className="review-grid">
        <div>
          <span>Customer</span>
          <strong>{customer?.full_name}</strong>
          <small>{customer?.phone}</small>
        </div>
        <div>
          <span>Vehicle</span>
          <strong>{vehicle?.registration_number}</strong>
          <small>{vehicle?.vehicle_type_name}</small>
        </div>
        <div>
          <span>Primary service</span>
          <strong>{primary?.name}</strong>
          <small>
            {addOns.length} add-on{addOns.length === 1 ? "" : "s"}
          </small>
        </div>
        <div>
          <span>Initial status</span>
          <strong>{startImmediately ? "In Progress" : "Waiting"}</strong>
          <small>Server timestamped</small>
        </div>
      </div>
      <div className="review-total">
        <span>Estimated service value</span>
        <strong>{money(estimate)}</strong>
        <small>
          Final total appears after server-side discounts, tax, and rounding.
        </small>
        {enteredDiscountMinor > 0 ? (
          <small>
            Selected reward/manual discounts: {money(enteredDiscountMinor)};
            eligibility and caps are checked on creation.
          </small>
        ) : null}
      </div>
    </SelectionStep>
  );
}

function NewCustomerDialog({
  onClose,
  onCreated,
  open,
}: {
  readonly onClose: () => void;
  readonly onCreated: (customer: CustomerRecord) => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<CustomerRecord>("/customers", {
        ...jsonBody({
          address: data.get("address") || undefined,
          email: data.get("email") || undefined,
          fullName: data.get("fullName"),
          phone: data.get("phone"),
        }),
        method: "POST",
      });
      onCreated(result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Customer creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Add customer">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Full name</span>
          <input name="fullName" required />
        </label>
        <label>
          <span>Phone</span>
          <input inputMode="tel" name="phone" required />
        </label>
        <label>
          <span>Email (optional)</span>
          <input name="email" type="email" />
        </label>
        <label>
          <span>Address (optional)</span>
          <textarea name="address" />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            Add customer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewVehicleDialog({
  customerId,
  onClose,
  onCreated,
  open,
}: {
  readonly customerId: string;
  readonly onClose: () => void;
  readonly onCreated: (vehicle: VehicleRecord) => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (vehicleTypeCode === "") {
      setFieldError("Select a vehicle type.");
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<VehicleRecord>("/vehicles", {
        ...jsonBody({
          colour: data.get("colour") || undefined,
          customerId,
          make: data.get("make") || undefined,
          model: data.get("model") || undefined,
          registrationNumber: data.get("registrationNumber"),
          vehicleTypeCode,
        }),
        method: "POST",
      });
      onCreated(result);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Vehicle creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Add vehicle">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Registration number</span>
          <input
            autoCapitalize="characters"
            name="registrationNumber"
            required
          />
        </label>
        <label>
          <span>Vehicle type</span>
          <VehicleTypeSelect
            {...(fieldError !== null ? { error: fieldError } : {})}
            onChange={(code) => {
              setVehicleTypeCode(code);
              setFieldError(null);
            }}
            value={vehicleTypeCode}
          />
        </label>
        <div className="form-grid">
          <label>
            <span>Make</span>
            <VehicleMakeAutocomplete name="make" />
          </label>
          <label>
            <span>Model</span>
            <VehicleModelAutocomplete name="model" />
          </label>
        </div>
        <label>
          <span>Colour</span>
          <input name="colour" />
        </label>
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} disabled={customerId === ""} type="submit">
            Add vehicle
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
