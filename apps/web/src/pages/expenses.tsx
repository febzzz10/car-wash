import {
  Download,
  Edit3,
  Plus,
  Power,
  Receipt,
  SearchX,
  Settings2,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusBadge,
} from "../components/ui";
import { useAuth } from "../auth";
import { useToast } from "../components/toast";
import { useApiData } from "../hooks/use-api-data";
import { api, apiBlob, jsonBody } from "../lib/api";
import { money, titleCase } from "../lib/format";

interface Expense {
  readonly amount_minor: number;
  readonly category_id: string;
  readonly category_name: string;
  readonly created_at: string;
  readonly description?: string | null;
  readonly expense_date: string;
  readonly expense_reference: string;
  readonly id: string;
  readonly payment_method?: string | null;
  readonly recorded_by_name: string;
  readonly status: string;
  readonly title: string;
  readonly version: number;
}
interface Category {
  readonly code: string;
  readonly display_order: number;
  readonly id: string;
  readonly is_active: number;
  readonly name: string;
}
export default function ExpensesPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const first = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const state = useApiData<readonly Expense[]>(
    `/expenses?from=${from}&to=${to}${category === "" ? "" : `&categoryId=${category}`}`,
  );
  const categories = useApiData<readonly Category[]>("/expense-categories");
  const total = useMemo(
    () =>
      (state.data ?? [])
        .filter((item) => item.status === "ACTIVE")
        .reduce((sum, item) => sum + item.amount_minor, 0),
    [state.data],
  );
  const toast = useToast();
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  async function exportCsv() {
    try {
      const blob = await apiBlob("/reports/export", {
        ...jsonBody({ format: "CSV", from, report: "expenses", to }),
        method: "POST",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `washpro-expenses-${from}-${to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Export failed.",
      );
    }
  }
  return (
    <>
      <PageHeader
        actions={
          <div className="button-row">
            {user?.role === "ADMIN" ||
            user?.permissions.includes("settings.manage") ? (
              <Button onClick={() => setCategoryDialog(true)} tone="secondary">
                <Settings2 size={17} /> Categories
              </Button>
            ) : null}
            <Button onClick={() => void exportCsv()} tone="secondary">
              <Download size={17} /> Export CSV
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus size={17} /> Add expense
            </Button>
          </div>
        }
        eyebrow="Finance"
        title="Expenses"
      />
      <div className="expense-summary">
        <span>This period</span>
        <strong>{money(total)}</strong>
        <small>
          Active expenses from {from} to {to}
        </small>
      </div>
      <Card>
        <div className="toolbar filters-form">
          <label>
            <span>From</span>
            <input
              onChange={(event) => setFrom(event.target.value)}
              name="expenseFrom"
              type="date"
              value={from}
            />
          </label>
          <label>
            <span>To</span>
            <input
              onChange={(event) => setTo(event.target.value)}
              name="expenseTo"
              type="date"
              value={to}
            />
          </label>
          <label>
            <span>Category</span>
            <select
              name="expenseCategory"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              <option value="">All categories</option>
              {categories.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {state.loading ? (
          <SkeletonRows />
        ) : state.error !== null ? (
          <ErrorState message={state.error} onRetry={state.reload} />
        ) : (state.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={SearchX}
            message="No expenses match the current date and category filters."
            title="No expenses found"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Recorded by</th>
                  <th>Status</th>
                  <th className="align-right">Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <strong>{expense.title}</strong>
                      <small className="identifier--muted">
                        {expense.expense_reference}
                      </small>
                    </td>
                    <td>{expense.category_name}</td>
                    <td>{expense.expense_date}</td>
                    <td>
                      {titleCase(expense.payment_method ?? "Not recorded")}
                    </td>
                    <td>{expense.recorded_by_name}</td>
                    <td>
                      <StatusBadge value={expense.status} />
                    </td>
                    <td className="align-right">
                      <strong>{money(expense.amount_minor)}</strong>
                    </td>
                    <td>
                      {expense.status === "ACTIVE" ? (
                        <div className="table-actions">
                          <Button
                            aria-label={`Edit ${expense.title}`}
                            onClick={() => setEditing(expense)}
                            tone="quiet"
                          >
                            <Edit3 size={17} />
                          </Button>
                          <Button
                            aria-label={`Cancel ${expense.title}`}
                            onClick={() => setCancelTarget(expense)}
                            tone="quiet"
                          >
                            <XCircle size={17} />
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ExpenseDialog
        categories={categories.data ?? []}
        expense={editing ?? null}
        key={editing?.id ?? "new"}
        onClose={() => setEditing(undefined)}
        onDone={() => {
          setEditing(undefined);
          state.reload();
        }}
        open={editing !== undefined}
      />
      <CategoryDialog
        categories={categories.data ?? []}
        onClose={() => setCategoryDialog(false)}
        onDone={categories.reload}
        open={categoryDialog}
      />
      <CancelExpenseDialog
        expense={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={() => {
          setCancelTarget(null);
          state.reload();
        }}
        open={cancelTarget !== null}
      />
    </>
  );
}

function CategoryDialog({
  categories,
  onClose,
  onDone,
  open,
}: {
  readonly categories: readonly Category[];
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(
        editing === null
          ? "/expense-categories"
          : `/expense-categories/${editing.id}`,
        {
          ...jsonBody({
            code: values.get("code"),
            displayOrder: Number(values.get("order")),
            name: values.get("name"),
          }),
          method: editing === null ? "POST" : "PATCH",
        },
      );
      toast.success(
        editing === null ? "Expense category added." : "Category updated.",
      );
      setEditing(null);
      event.currentTarget.reset();
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Category update failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(category: Category) {
    try {
      await api(`/expense-categories/${category.id}`, {
        ...jsonBody({ isActive: category.is_active !== 1 }),
        method: "PATCH",
      });
      toast.success("Category status updated.");
      onDone();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Category update failed.",
      );
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Expense categories">
      <form
        className="dialog-form"
        key={editing?.id ?? "new-category"}
        onSubmit={(event) => void submit(event)}
      >
        {error === null ? null : (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>Category name</span>
            <input defaultValue={editing?.name} name="name" required />
          </label>
          <label>
            <span>Code</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              defaultValue={editing?.code}
              name="code"
              required
              spellCheck={false}
            />
          </label>
          <label>
            <span>Display order</span>
            <input
              defaultValue={editing?.display_order ?? 0}
              name="order"
              type="number"
            />
          </label>
        </div>
        <div className="dialog-actions">
          {editing === null ? null : (
            <Button
              onClick={() => setEditing(null)}
              tone="secondary"
              type="button"
            >
              Cancel edit
            </Button>
          )}
          <Button busy={busy} type="submit">
            {editing === null ? "Add category" : "Save category"}
          </Button>
        </div>
      </form>
      <div className="category-list">
        {categories.map((category) => (
          <div key={category.id}>
            <span>
              <strong>{category.name}</strong>
              <small className="identifier--muted">{category.code}</small>
            </span>
            <StatusBadge
              value={category.is_active === 1 ? "ACTIVE" : "DISABLED"}
            />
            <div className="table-actions">
              <Button
                aria-label={`Edit ${category.name}`}
                onClick={() => setEditing(category)}
                tone="quiet"
              >
                <Edit3 size={17} />
              </Button>
              <Button
                aria-label={`Toggle ${category.name}`}
                onClick={() => void toggle(category)}
                tone="quiet"
              >
                <Power size={17} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
function ExpenseDialog({
  categories,
  expense,
  onClose,
  onDone,
  open,
}: {
  readonly categories: readonly Category[];
  readonly expense: Expense | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      let receiptAssetId: string | undefined;
      const receipt = values.get("receipt");
      if (expense === null && receipt instanceof File && receipt.size > 0) {
        const form = new FormData();
        form.set("file", receipt);
        receiptAssetId = (
          await api<{ readonly id: string }>("/uploads/receipt", {
            body: form,
            method: "POST",
          })
        ).id;
      }
      await api(expense === null ? "/expenses" : `/expenses/${expense.id}`, {
        ...jsonBody({
          amountMinor: Math.round(Number(values.get("amount")) * 100),
          categoryId: values.get("categoryId"),
          description: values.get("description") || undefined,
          expenseDate: values.get("date"),
          ...(expense === null
            ? { idempotencyKey: crypto.randomUUID(), receiptAssetId }
            : { version: expense.version }),
          paymentMethod: values.get("method") || undefined,
          title: values.get("title"),
        }),
        method: expense === null ? "POST" : "PATCH",
      });
      toast.success(
        expense === null ? "Expense recorded." : "Expense updated.",
      );
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Expense could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={onClose}
      open={open}
      title={expense === null ? "Add expense" : "Edit expense"}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Title</span>
          <input defaultValue={expense?.title} name="title" required />
        </label>
        <label>
          <span>Category</span>
          <select
            defaultValue={expense?.category_id ?? ""}
            name="categoryId"
            required
          >
            <option value="">Select category</option>
            {categories
              .filter((item) => item.is_active === 1)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            <span>Amount</span>
            <input
              min="0.01"
              defaultValue={
                expense === null
                  ? undefined
                  : (expense.amount_minor / 100).toFixed(2)
              }
              name="amount"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Date</span>
            <input
              defaultValue={
                expense?.expense_date ?? new Date().toISOString().slice(0, 10)
              }
              name="date"
              required
              type="date"
            />
          </label>
        </div>
        <label>
          <span>Payment method</span>
          <select
            defaultValue={expense?.payment_method ?? "CASH"}
            name="method"
          >
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          <span>Description</span>
          <textarea
            defaultValue={expense?.description ?? ""}
            name="description"
          />
        </label>
        {expense === null ? (
          <label>
            <span>Receipt (optional, private)</span>
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              name="receipt"
              type="file"
            />
          </label>
        ) : null}
        <div className="dialog-actions">
          <Button onClick={onClose} tone="secondary" type="button">
            Cancel
          </Button>
          <Button busy={busy} type="submit">
            <Receipt size={17} />
            {expense === null ? "Save expense" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CancelExpenseDialog({
  expense,
  onClose,
  onDone,
  open,
}: {
  readonly expense: Expense | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly open: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();
    if (reason.length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/expenses/${expense!.id}/cancel`, {
        ...jsonBody({ reason, version: expense!.version }),
        method: "POST",
      });
      onDone();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Cancellation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog onClose={onClose} open={open} title="Cancel expense">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p>
          Cancelling this expense removes it from active expense totals while
          preserving its record for audit purposes.
        </p>
        {error === null ? null : <div className="form-alert">{error}</div>}
        <label>
          <span>Reason</span>
          <textarea minLength={5} name="reason" required />
        </label>
        <div className="dialog-actions">
          <Button busy={busy} tone="danger">
            Cancel Expense
          </Button>
          <Button onClick={onClose} tone="secondary" type="button">
            Keep Expense
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
