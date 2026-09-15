export type UserRole = "maker" | "checker" | "approver";

export type EntityStatus = "active" | "inactive";

export type AccountType = "bank" | "cash";

export type TransactionDirection = "income" | "expense";

export type TransactionStatus = "pending" | "approved" | "rejected";

export type IncomeCategory =
  | "sales_revenue"
  | "other_business_income"
  | "transfers_received"
  | "other_incoming";

export type ExpenseCategory =
  | "operating_expenses"
  | "purchases"
  | "salaries"
  | "utilities"
  | "transportation"
  | "other_business_expenses"
  | "transfers_sent";

export type TransactionCategory = IncomeCategory | ExpenseCategory;

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole | null;
  mustChangePassword: boolean;
  createdAt: Date;
}

export interface Business {
  id: string;
  name: string;
  code: string;
  status: EntityStatus;
  notes?: string;
  isSystem?: boolean;
  totalCapital?: number;
  /** Denormalized sum of fixedAssets subcollection amounts. */
  fixedAssetExpense?: number;
  totalSaleVolume?: number;
  operationExpense?: number;
  totalProfit?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FixedAsset {
  id: string;
  name: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  bankName?: string;
  accountNumber?: string;
  bankBranch?: string;
  bankAddress?: string;
  currency: "MMK";
  openingBalance: number;
  currentBalance: number;
  pendingCount: number;
  approvedCount: number;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionAttachment {
  path: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface Transaction {
  id: string;
  displayId: string;
  businessId: string;
  accountId: string;
  direction: TransactionDirection;
  category: TransactionCategory;
  amount: number;
  date: string;
  description: string;
  status: TransactionStatus;
  makerId: string;
  makerName?: string;
  /** @deprecated legacy approve actor; prefer approverId */
  checkerId?: string;
  /** @deprecated legacy approve actor; prefer approverName */
  checkerName?: string;
  approverId?: string;
  approverName?: string;
  rejectionReason?: string;
  transferGroupId?: string;
  linkedTransactionId?: string;
  attachments: TransactionAttachment[];
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
}

export type AuditAction = "created" | "updated" | "approved" | "rejected";

export type AuditEntityType = "transaction" | "user";

export interface AuditChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  actorId: string;
  actorName: string;
  previousStatus?: TransactionStatus;
  newStatus?: TransactionStatus;
  changes?: AuditChange[];
  rejectionReason?: string;
  businessId?: string;
  accountId?: string;
  amount?: number;
  direction?: TransactionDirection;
  description?: string;
  transferGroupId?: string;
  linkedTransactionId?: string;
  createdAt: Date;
}

export const MAX_TRANSACTION_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Max size accepted before client-side compression (phone photos). */
export const MAX_ATTACHMENT_INPUT_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_MAX_EDGE_PX = 1920;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string }[] = [
  { value: "sales_revenue", label: "Sales revenue" },
  { value: "other_business_income", label: "Other business income" },
  { value: "transfers_received", label: "Transfers received" },
  { value: "other_incoming", label: "Other incoming funds" },
];

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "operating_expenses", label: "Operating expenses" },
  { value: "purchases", label: "Purchases" },
  { value: "salaries", label: "Salaries" },
  { value: "utilities", label: "Utilities" },
  { value: "transportation", label: "Transportation" },
  { value: "other_business_expenses", label: "Other business expenses" },
  { value: "transfers_sent", label: "Transfers sent" },
];

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  sales_revenue: "Sales revenue",
  other_business_income: "Other business income",
  transfers_received: "Transfers received",
  other_incoming: "Other incoming funds",
  operating_expenses: "Operating expenses",
  purchases: "Purchases",
  salaries: "Salaries",
  utilities: "Utilities",
  transportation: "Transportation",
  other_business_expenses: "Other business expenses",
  transfers_sent: "Transfers sent",
};

/** Income/expense bucket used by denormalized summary docs.
 * `income`/`expense` are external (non-transfer) only.
 * Internal moves live in `transferIn` / `transferOut`.
 */
export interface IncomeExpenseBucket {
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
}

export interface GroupSummary extends IncomeExpenseBucket {
  pendingCount: number;
  updatedAt?: Date;
}

/** Group month rollup with per-entity breakdowns for dashboard charts. */
export interface GroupMonthSummary extends IncomeExpenseBucket {
  id: string; // YYYY-MM
  byBusiness: Record<string, IncomeExpenseBucket>;
  byAccount: Record<string, IncomeExpenseBucket>;
}

export interface EntitySummary extends IncomeExpenseBucket {
  id: string;
  updatedAt?: Date;
}

export interface EntityMonthSummary extends IncomeExpenseBucket {
  id: string; // YYYY-MM
}

export const DEFAULT_PAGE_SIZE = 40;
