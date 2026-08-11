import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  RotateCcw,
  UserRoundSearch,
  VideoOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { useMaskedPhone } from "../hooks/use-masked-phone";
import { api, jsonBody } from "../lib/api";
import { dateTime, money } from "../lib/format";
import {
  parseWizardDraft,
  serializeWizardDraft,
  STEP_IDS,
  WASH_DRAFT_STORAGE_KEY,
} from "../lib/wizard-draft";
import { normalizePhone } from "@washpro/domain";
import type {
  CustomerRecord,
  ServicePriceRecord,
  ServiceRecord,
  VehicleRecord,
  VehicleTypeRecord,
} from "../types";

export const stepLabels = [
  "Customer",
  "Vehicle",
  "Assign",
  "Live photo & location",
  "Services",
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
interface Evidence {
  readonly photoAssetId?: string | undefined;
  readonly photoPreview?: string | undefined;
  readonly place?: string | undefined;
  readonly capturedAt?: string | undefined;
}

function hasCompleteEvidence(evidence: Evidence): boolean {
  return (
    evidence.photoAssetId !== undefined &&
    Boolean(evidence.place?.trim()) &&
    evidence.capturedAt !== undefined
  );
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
  const [assignedUserId, setAssignedUserId] = useState(
    restored?.assignedUserId ?? "",
  );
  const [startImmediately, setStartImmediately] = useState(
    restored?.startImmediately ?? false,
  );
  const [evidence, setEvidence] = useState<Evidence>(
    restored?.photoAssetId
      ? {
          photoAssetId: restored.photoAssetId,
          place: restored.place,
          capturedAt: restored.capturedAt,
        }
      : {},
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [explicitCustomer, setExplicitCustomer] =
    useState<CustomerRecord | null>(null);
  const { user } = useAuth();
  const maskPhone = useMaskedPhone();
  const isAdmin = user?.role === "ADMIN";
  const searching = search.trim() !== "";
  const customers = useApiData<readonly CustomerRecord[]>(
    `/customers?search=${encodeURIComponent(search)}`,
    isAdmin || searching,
  );
  const staff = useApiData<readonly StaffRecord[]>(
    "/wash-jobs/assignable-users",
  );
  const vehicles = useApiData<readonly VehicleRecord[]>("/vehicles");
  const services = useApiData<ServicePayload>("/services");
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (assignedUserId === "") return;
    const eligible = (staff.data ?? []).filter((p) => p.role === "STAFF");
    if (!eligible.some((p) => p.id === assignedUserId)) {
      setAssignedUserId("");
    }
  }, [staff.data, assignedUserId]);

  useEffect(() => {
    sessionStorage.setItem(
      WASH_DRAFT_STORAGE_KEY,
      serializeWizardDraft({
        addOnServiceIds: [...addOnServiceIds],
        assignedUserId: assignedUserId || undefined,
        customerId: customerId || undefined,
        servicePriceId: primaryServiceId || undefined,
        startImmediately,
        step,
        stepId: STEP_IDS[step]!,
        vehicleId: vehicleId || undefined,
        photoAssetId: evidence.photoAssetId,
        place: evidence.place,
        capturedAt: evidence.capturedAt,
      }),
    );
  }, [
    addOnServiceIds,
    assignedUserId,
    customerId,
    evidence.capturedAt,
    evidence.photoAssetId,
    evidence.place,
    primaryServiceId,
    startImmediately,
    step,
    vehicleId,
  ]);

  const selectedCustomer =
    customers.data?.find((item) => item.id === customerId) ??
    (explicitCustomer !== null && explicitCustomer.id === customerId
      ? explicitCustomer
      : undefined);

  useEffect(() => {
    if (customerId === "") setExplicitCustomer(null);
  }, [customerId]);
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
        assignedUserId !== "",
        hasCompleteEvidence(evidence),
        primaryServiceId !== "",
        true,
      ][step] ?? false
    );
  }

  function goNext() {
    if (step === 3 && !hasCompleteEvidence(evidence)) {
      if (!evidence.place?.trim() || !evidence.capturedAt) {
        setLocationError("Capture the location place before continuing.");
      }
      return;
    }
    setStep((value) => Math.min(stepLabels.length - 1, value + 1));
  }

  async function createJob(
    requestedStatus?: "DRAFT" | "WAITING" | "IN_PROGRESS",
  ) {
    if (!hasCompleteEvidence(evidence)) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api<{ readonly id: string }>("/wash-jobs", {
        ...jsonBody({
          addOnServiceIds,
          assignedUserId,
          customerId,
          idempotencyKey: crypto.randomUUID(),
          initialStatus:
            requestedStatus ?? (startImmediately ? "IN_PROGRESS" : "WAITING"),
          location: {
            place: evidence.place!.trim(),
            capturedAt: evidence.capturedAt!,
          },
          photoAssetId: evidence.photoAssetId,
          primaryServiceId,
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
              intro="Search by customer name, phone, or vehicle registration number. Phone and registration numbers are normalized for matching."
            >
              <div className="selection-toolbar">
                <SearchField
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, phone, or registration number..."
                  value={search}
                />
                <Button
                  onClick={() => setCustomerDialog(true)}
                  tone="secondary"
                >
                  <Plus size={17} /> Add customer
                </Button>
              </div>
              {isAdmin || searching || selectedCustomer !== undefined ? null : (
                <p className="step-intro" role="status">
                  Search by customer name, phone, or vehicle registration number
                  to find a customer.
                </p>
              )}
              {isAdmin || searching ? (
                customers.loading ? (
                  <SkeletonRows />
                ) : customers.error !== null ? (
                  <ErrorState
                    message={customers.error}
                    onRetry={customers.reload}
                  />
                ) : !isAdmin && (customers.data?.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={UserRoundSearch}
                    message="Try a different name, phone number, or registration number."
                    title="No customers found"
                  />
                ) : (
                  <div className="choice-list">
                    {customers.data?.map((customer) => (
                      <Choice
                        active={customer.id === customerId}
                        key={customer.id}
                        onClick={() => {
                          setCustomerId(customer.id);
                          setExplicitCustomer(customer);
                          setVehicleId("");
                        }}
                        primary={customer.full_name}
                        secondary={
                          customer.matching_registrations !== undefined &&
                          customer.matching_registrations.length > 0
                            ? `${customer.matching_registrations.join(", ")} · ${maskPhone(customer.phone)} · ${customer.total_visits_cached} visits`
                            : `${maskPhone(customer.phone)} · ${customer.total_visits_cached} visits`
                        }
                      />
                    ))}
                  </div>
                )
              ) : selectedCustomer !== undefined ? (
                <div className="choice-list">
                  <Choice
                    active
                    onClick={() => {}}
                    primary={selectedCustomer.full_name}
                    secondary={
                      selectedCustomer.matching_registrations !== undefined &&
                      selectedCustomer.matching_registrations.length > 0
                        ? `${selectedCustomer.matching_registrations.join(", ")} · ${maskPhone(selectedCustomer.phone)} · ${selectedCustomer.total_visits_cached} visits`
                        : `${maskPhone(selectedCustomer.phone)} · ${selectedCustomer.total_visits_cached} visits`
                    }
                  />
                </div>
              ) : null}
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
                      primaryClassName="identifier"
                      secondary={`${vehicle.vehicle_type_name ?? "Vehicle"}${vehicle.make === null || vehicle.make === undefined ? "" : ` · ${vehicle.make} ${vehicle.model ?? ""}`}`}
                    />
                  ))}
                </div>
              )}
            </SelectionStep>
          ) : null}
          {step === 2 ? (
            <SelectionStep
              heading="Assign the wash"
              intro="Only active staff members at this branch are available."
            >
              {staff.loading ? (
                <SkeletonRows />
              ) : staff.error !== null ? (
                <ErrorState message={staff.error} onRetry={staff.reload} />
              ) : (
                <div className="choice-grid">
                  {(staff.data ?? []).filter((p) => p.role === "STAFF")
                    .length === 0 ? (
                    <EmptyState
                      icon={MapPin}
                      message="No active staff members are available for assignment."
                      title="No staff available"
                    />
                  ) : (
                    (staff.data ?? [])
                      .filter((p) => p.role === "STAFF")
                      .map((person) => (
                        <Choice
                          active={person.id === assignedUserId}
                          key={person.id}
                          onClick={() => setAssignedUserId(person.id)}
                          primary={person.full_name}
                          secondary="Staff member"
                        />
                      ))
                  )}
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
          {step === 3 ? (
            <PhotoLocationStep
              evidence={evidence}
              locationError={locationError}
              onChange={setEvidence}
              onLocationErrorChange={setLocationError}
            />
          ) : null}
          {step === 4 ? (
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
            <ReviewStep
              addOns={selectedAddOns}
              assignedUserName={
                assignedUserId === ""
                  ? "Unassigned"
                  : (staff.data?.find((p) => p.id === assignedUserId)
                      ?.full_name ?? "Unassigned")
              }
              customer={selectedCustomer}
              estimate={estimate}
              evidence={evidence}
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
              <Button disabled={!canContinue()} onClick={() => goNext()}>
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
            valueClassName="identifier"
          />
          <SummaryLine
            label="Assigned to"
            value={
              assignedUserId === ""
                ? "Unassigned"
                : (staff.data?.find((p) => p.id === assignedUserId)
                    ?.full_name ?? "Unassigned")
            }
          />
          <SummaryLine
            label="Start"
            value={startImmediately ? "Immediately" : "On creation"}
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
            <span className={evidence.place?.trim() ? "done" : ""}>
              <MapPin size={17} /> Location{" "}
              {evidence.place?.trim()
                ? evidence.place.trim()
                : "required"}
            </span>
          </div>
        </aside>
      </div>
      <NewCustomerDialog
        onClose={() => setCustomerDialog(false)}
        onCreated={(customer) => {
          setCustomerId(customer.id);
          setExplicitCustomer(customer);
          setCustomerDialog(false);
          customers.reload();
        }}
        onSelected={(customer) => {
          setCustomerId(customer.id);
          setExplicitCustomer(customer);
          setCustomerDialog(false);
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
  primaryClassName = "",
  secondary,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly primary: string;
  readonly primaryClassName?: string;
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
        <strong className={primaryClassName}>{primary}</strong>
        <small>{secondary}</small>
      </span>
    </button>
  );
}
function SummaryLine({
  label,
  value,
  valueClassName = "",
}: {
  readonly label: string;
  readonly value: string;
  readonly valueClassName?: string;
}) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong className={valueClassName}>{value}</strong>
    </div>
  );
}

function PhotoLocationStep({
  evidence,
  locationError,
  onChange,
  onLocationErrorChange,
}: {
  readonly evidence: Evidence;
  readonly locationError: string | null;
  readonly onChange: (evidence: Evidence) => void;
  readonly onLocationErrorChange: (message: string | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const photoDone = evidence.photoAssetId !== undefined;
  const locationDone = Boolean(evidence.place?.trim());
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
    if (locBusy) return;
    if (!("geolocation" in navigator)) {
      onLocationErrorChange("Geolocation is not available in this browser.");
      return;
    }
    setLocBusy(true);
    onLocationErrorChange(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const capturedAt = Number.isFinite(position.timestamp)
          ? new Date(position.timestamp).toISOString()
          : new Date().toISOString();
        try {
          const result = await api<{ readonly place: string }>("/geocode/reverse", {
            ...jsonBody({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            method: "POST",
          });
          if (!result.place.trim()) {
            onLocationErrorChange(
              "Unable to determine a readable place. Please try again.",
            );
            return;
          }
          onChange({
            ...evidence,
            place: result.place,
            capturedAt,
          });
        } catch {
          onLocationErrorChange(
            "Unable to determine a readable place. Please try again.",
          );
        } finally {
          setLocBusy(false);
        }
      },
      (failure) => {
        onLocationErrorChange(
          failure.code === failure.PERMISSION_DENIED
            ? "Location permission is required to continue."
            : "Unable to capture your location. Please try again.",
        );
        setLocBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }
  return (
    <SelectionStep
      heading="Capture photo & location"
      intro="Take a live rear-camera photo of the vehicle and capture the current location. Both are required to continue."
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
              Capture your current location to record a readable place name. This
              is required to continue.
            </p>
          )}
          {locationError === null ? null : (
            <div className="form-alert" role="alert">
              {locationError}
            </div>
          )}
          {locBusy ? (
            <p className="step-intro" role="status">
              Capturing location…
            </p>
          ) : null}
          {!locationDone ? (
            <Button busy={locBusy} onClick={() => void captureLocation()}>
              <MapPin size={18} /> Capture place
            </Button>
          ) : null}
        </div>
      ) : null}
    </SelectionStep>
  );
}

function ReviewStep({
  addOns,
  assignedUserName,
  customer,
  estimate,
  evidence,
  primary,
  startImmediately,
  vehicle,
}: {
  readonly addOns: readonly ServiceRecord[];
  readonly assignedUserName: string;
  readonly customer: CustomerRecord | undefined;
  readonly estimate: number;
  readonly evidence: Evidence;
  readonly primary: ServiceRecord | undefined;
  readonly startImmediately: boolean;
  readonly vehicle: VehicleRecord | undefined;
}) {
  const maskPhone = useMaskedPhone();
  return (
    <SelectionStep
      heading="Review and create"
      intro="The server will validate evidence, reserve benefits atomically, snapshot prices, and calculate the final bill."
    >
      <div className="review-grid">
        <div>
          <span>Customer</span>
          <strong>{customer?.full_name}</strong>
          <small>{maskPhone(customer?.phone)}</small>
        </div>
        <div>
          <span>Vehicle</span>
          <strong className="identifier">{vehicle?.registration_number}</strong>
          <small>{vehicle?.vehicle_type_name}</small>
        </div>
        <div>
          <span>Assigned to</span>
          <strong>{assignedUserName}</strong>
        </div>
        <div>
          <span>Initial status</span>
          <strong>{startImmediately ? "In Progress" : "Waiting"}</strong>
          <small>Server timestamped</small>
        </div>
        {evidence.photoAssetId !== undefined ? (
          <div>
            <span>Vehicle photo</span>
            {evidence.photoPreview !== undefined ? (
              <img
                alt="Live vehicle capture"
                className="review-photo"
                height="120"
                src={evidence.photoPreview}
                width="160"
              />
            ) : (
              <p className="review-photo-fallback">
                Live photo captured
                {evidence.photoAssetId !== undefined &&
                evidence.photoPreview === undefined
                  ? " (restored from draft)"
                  : ""}
              </p>
            )}
          </div>
        ) : null}
        {evidence.place !== undefined && evidence.capturedAt !== undefined ? (
          <>
            <div>
              <span>Location place</span>
              <strong>{evidence.place}</strong>
            </div>
            <div>
              <span>Captured at</span>
              <strong>
                {dateTime(evidence.capturedAt)}
              </strong>
            </div>
          </>
        ) : (
          <div>
            <span>Location</span>
            <strong>Not captured</strong>
          </div>
        )}
        <div>
          <span>Primary service</span>
          <strong>{primary?.name}</strong>
          <small>
            {addOns.length} add-on{addOns.length === 1 ? "" : "s"}
          </small>
        </div>
      </div>
      <div className="review-total">
        <span>Estimated service value</span>
        <strong>{money(estimate)}</strong>
        <small>
          Final total appears after server-side discounts, tax, and rounding.
        </small>
      </div>
    </SelectionStep>
  );
}

function NewCustomerDialog({
  onClose,
  onCreated,
  onSelected,
  open,
}: {
  readonly onClose: () => void;
  readonly onCreated: (customer: CustomerRecord) => void;
  readonly onSelected: (customer: CustomerRecord) => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const maskPhone = useMaskedPhone();
  const [error, setError] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneLookupResults, setPhoneLookupResults] = useState<
    readonly CustomerRecord[] | null
  >(null);
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lookupSeq = useRef(0);

  const exactMatchCustomer = useMemo(() => {
    if (phoneLookupResults === null || phoneValue.trim() === "") return null;
    let normalized: string;
    try {
      normalized = normalizePhone(phoneValue);
    } catch {
      return null;
    }
    return (
      phoneLookupResults.find(
        (c) => c.phone_normalized === normalized,
      ) ?? null
    );
  }, [phoneLookupResults, phoneValue]);

  const hasExactDuplicate = exactMatchCustomer !== null;

  const performLookup = useCallback(
    async (query: string, seq: number) => {
      if (abortRef.current !== null) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhoneLookupLoading(true);
      try {
        const digits = query.replace(/\D/g, "");
        const result = await api<readonly CustomerRecord[]>(
          `/customers?search=${encodeURIComponent(digits)}`,
          { signal: controller.signal },
        );
        if (seq !== lookupSeq.current) return;
        setPhoneLookupResults(
          result.length === 0 ? null : result.slice(0, 5),
        );
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        if (seq !== lookupSeq.current) return;
        setPhoneLookupResults(null);
      } finally {
        if (seq === lookupSeq.current) setPhoneLookupLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setPhoneValue("");
    setPhoneLookupResults(null);
    setPhoneLookupLoading(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    const digits = phoneValue.replace(/\D/g, "");
    if (digits.length < 3) {
      setPhoneLookupResults(null);
      setPhoneLookupLoading(false);
      return;
    }
    const seq = ++lookupSeq.current;
    debounceRef.current = setTimeout(() => {
      void performLookup(phoneValue, seq);
    }, 200);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [phoneValue, performLookup]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasExactDuplicate) return;
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
      if (
        reason instanceof Error &&
        "code" in reason &&
        (reason as { code: string }).code === "DUPLICATE_CUSTOMER"
      ) {
        const digits = phoneValue.replace(/\D/g, "");
        if (digits.length >= 3) {
          void performLookup(phoneValue, ++lookupSeq.current);
        }
      }
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
          <span>WhatsApp / Phone Number</span>
          <input
            inputMode="tel"
            name="phone"
            onChange={(e) => setPhoneValue(e.target.value)}
            required
            value={phoneValue}
          />
        </label>
        {phoneLookupLoading ? (
          <p className="step-intro" role="status">
            Searching existing customers…
          </p>
        ) : null}
        {hasExactDuplicate ? (
          <div className="card">
            <div className="review-grid">
              <div>
                <span>Existing customer found</span>
                <strong>{exactMatchCustomer.full_name}</strong>
                <small>{maskPhone(exactMatchCustomer.phone)}</small>
                {exactMatchCustomer.total_visits_cached > 0 ? (
                  <small>{exactMatchCustomer.total_visits_cached} visits</small>
                ) : null}
              </div>
            </div>
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  onSelected(exactMatchCustomer);
                }}
                tone="primary"
                type="button"
              >
                Use existing customer
              </Button>
            </div>
          </div>
        ) : phoneLookupResults !== null && phoneLookupResults.length > 0 ? (
          <div className="choice-list">
            {phoneLookupResults.map((customer) => (
              <button
                className="choice-card"
                key={customer.id}
                onClick={() => {
                  onSelected(customer);
                }}
                type="button"
              >
                <span>
                  <strong>{customer.full_name}</strong>
                  <small>
                    {maskPhone(customer.phone)}
                    {customer.total_visits_cached > 0
                      ? ` · ${customer.total_visits_cached} visits`
                      : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
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
          <Button busy={busy} disabled={hasExactDuplicate} type="submit">
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
            className="font-mono"
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
