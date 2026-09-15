# The Golden 7 Myanmar Group Co., Ltd. — Financial Management System

## 1. System Overview

**The Golden 7 Myanmar Group Co., Ltd. Financial Management System** is a centralized web-based financial management platform designed to manage, monitor, and organize the financial activities of all businesses under the Golden 7 Myanmar Group.

The system provides a single financial management environment where authorized users can record and monitor **all incoming and outgoing financial transactions** across multiple businesses, bank accounts, and cash-in-hand balances.

It is designed around a **Maker–Checker workflow**, ensuring that financial records are properly entered, reviewed, and approved before becoming part of the organization's official financial records.

The system will provide management with a clear overview of the group's financial position through **monthly, yearly, and all-time financial reports and summaries**.

---

## 2. Main Objectives

The system is intended to:

* Centralize financial records across all businesses owned by the group.
* Track all **income and expenses** in an organized and structured manner.
* Maintain separate financial records for each business.
* Manage multiple bank accounts and cash-in-hand balances.
* Provide consolidated financial visibility across the entire group.
* Calculate and display the group's **retained earnings** based on recorded financial activities.
* Provide monthly, yearly, and all-time financial summaries.
* Introduce proper financial authorization through a **Maker–Checker workflow**.
* Maintain an auditable history of financial records and their approval status.
* Reduce dependency on manually maintained spreadsheets and improve financial data consistency.

---

# 3. Business Management

The system will support multiple businesses under **The Golden 7 Myanmar Group Co., Ltd.**

Authorized users can manage the businesses through a centralized business management module.

### Business Management Features

* Create a new business
* View business details
* Edit business information
* Activate/deactivate a business
* View financial activity by individual business
* View income and expenses for each business
* View business-level financial summaries
* View retained earnings contributed by each business

The system will also provide a **consolidated group-level financial view**, allowing management to understand the overall financial performance of all businesses.

---

# 4. Financial Transaction Management

The core functionality of the system is recording and managing financial transactions.

Every transaction should contain sufficient information to identify:

* Business
* Transaction type
* Amount
* Financial account
* Transaction date
* Description / remarks
* Maker
* Checker
* Transaction status
* Created date
* Approved date

### Transaction Types

The system will primarily support:

**Income / Money In**

* Sales revenue
* Other business income
* Transfers received
* Other incoming funds

**Expense / Money Out**

* Operating expenses
* Purchases
* Salaries
* Utilities
* Transportation
* Other business expenses
* Transfers sent

**Internal transfers** create two linked pending legs (out + in) across accounts/businesses and are approved or rejected together.

**Retained Earnings** is maintained as a system business unit (code `RE`) that can send and receive transfers, matching the group spreadsheet model.

The transaction structure should remain flexible enough to support additional financial categories in the future.

---

# 5. Maker–Checker Workflow

The financial system will implement a **Maker–Checker authorization workflow** to provide better control over financial records.

### Maker

The **Maker** is responsible for entering financial transactions into the system.

The Maker can:

* Create financial records
* Enter income transactions
* Enter expense transactions
* Select the relevant business
* Select the relevant bank account or cash account
* Edit records that have not yet been approved
* Submit records for checking
* View the status of submitted records

A Maker should **not be able to approve their own financial records**.

### Checker

The **Checker** acts as the financial administrator.

The Checker can:

* Manage businesses (including KPI fields and Retained Earnings)
* Manage bank accounts and cash
* Manage users and roles
* View consolidated financial information and audit logs
* Create and edit pending financial records
* Review financial reports

The Checker does **not** approve or reject transactions.

### Approver

The **Approver** has the same create and master-data capabilities as the Checker, and also finalizes financial records.

The Approver can:

* Everything a Checker can (businesses, accounts, users, transactions, KPIs)
* Approve or reject pending transactions (including linked internal transfers)
* View the dashboard, transaction list, and audit logs

### Transaction Status

A financial record can follow a workflow such as:

**Pending Review → Approved / Rejected**

Makers and Checkers create pending records. Only Approvers change status to Approved or Rejected.

Only **approved transactions** should be included in official financial summaries and retained-earnings calculations.

This prevents unverified transactions from affecting the organization's financial position.

---

# 6. Bank Account Management

The system will maintain information about all bank accounts used by the group and its businesses.

### Bank Account Features

* Create bank accounts
* Edit bank account information
* Activate/deactivate accounts
* View current balance
* View transaction history
* Filter transactions by date
* View income and expenses associated with an account

A bank account may contain information such as:

* Bank name
* Account name
* Account number
* Currency
* Associated business
* Opening balance
* Current balance
* Status

The system should calculate the current balance based on the opening balance and approved financial transactions.

---

# 7. Cash-in-Hand Management

In addition to bank accounts, the system will support **Cash in Hand** as a financial account.

Cash-in-hand should be treated as a financial account similar to a bank account, allowing users to track:

* Opening cash balance
* Cash received
* Cash payments
* Current cash balance
* Cash transaction history

This allows the system to provide a more complete picture of the group's actual available funds.

---

# 8. Group Financial Overview

The dashboard will provide a consolidated financial overview of the entire group.

Management should be able to quickly see:

* Total income
* Total expenses
* Net profit
* Retained earnings
* Total bank balances
* Total cash in hand
* Total available funds
* Number of businesses
* Number of bank accounts
* Pending financial records

The dashboard should also allow users to understand where the group's money is coming from and where it is being spent.

---

# 9. Financial Periods and Reporting

The system will support financial analysis across different periods.

### Monthly

Users can view:

* Monthly income
* Monthly expenses
* Monthly net profit
* Monthly retained earnings
* Business-level performance
* Bank/cash movements

### Yearly

Users can view:

* Annual income
* Annual expenses
* Annual net profit
* Annual retained earnings
* Business performance
* Financial account movements

### All Time

The system can provide a consolidated historical view of:

* Total income
* Total expenses
* Total retained earnings
* Total funds
* Business financial performance
* Bank and cash movements

Users should be able to filter financial information by:

**Date → Business → Account → Transaction Type → Status**

---

# 10. Retained Earnings

The system will maintain a consolidated view of **retained earnings across all businesses**.

At a basic operational level, retained earnings can be calculated from approved financial results:

**Retained Earnings = Opening Retained Earnings + Net Profit − Distributions/Withdrawals**

where:

**Net Profit = Total Income − Total Expenses**

The system should provide both:

* **Business-level retained earnings**
* **Group-level consolidated retained earnings**

This allows management to understand how much profit has been accumulated by each business and by the group as a whole.

> If the company later requires full accounting functionality such as liabilities, assets, equity, depreciation, accounts payable/receivable, or formal financial statements, the retained-earnings model should be expanded into a proper accounting/ledger structure rather than relying only on income and expense transactions.

---

# 11. Dashboard

The main dashboard will act as the financial control center for the group.

### Key Dashboard Cards

* Total Group Income
* Total Group Expenses
* Net Profit
* Retained Earnings
* Total Bank Balance
* Cash in Hand
* Total Available Funds
* Pending Transactions

### Dashboard Analytics

The dashboard can include:

* Income vs. expense chart
* Monthly financial trend
* Business-wise income
* Business-wise expenses
* Business profitability
* Bank balance distribution
* Recent transactions
* Pending approvals

The displayed figures should be based only on **approved financial records** where appropriate.

---

# 12. User and Access Control

The system will initially support two primary roles.

| Role         | Main Responsibility                                                          |
| ------------ | ---------------------------------------------------------------------------- |
| **Maker**    | Creates and submits financial records                                        |
| **Checker**  | Manages master data and creates transactions; does not approve              |
| **Approver** | Same as Checker, plus approve/reject on pending records                     |

Role-based access control should be enforced at both the **UI and Firebase security-rule level**.

A user should only be able to perform actions permitted by their assigned role.

---

# 13. Audit Trail

Because this is a financial management system, important actions should be traceable.

The system should maintain an audit history for financial records, including:

* Who created the record
* When it was created
* Who modified it
* What was modified
* Who approved/rejected it
* When it was approved/rejected
* Previous transaction status
* Rejection reason, if applicable

This provides accountability and makes it easier to investigate financial discrepancies.

---

# 14. Technology Stack

### Frontend

* **Next.js**
* TypeScript
* React
* **shadcn/ui**
* Responsive dashboard interface

### Backend / Infrastructure

* **Firebase Authentication**
* **Cloud Firestore**
* Firebase Security Rules
* Firebase Cloud Functions where server-side processing is required
* Firebase Storage if supporting documents/receipts are added later

### Configuration

All sensitive configuration values should be managed through properly configured **environment variables**.

Examples include:

* Firebase configuration
* Firebase Admin credentials where applicable
* Application configuration
* Third-party service credentials

Sensitive credentials must **not** be hardcoded into the source code or committed to Git.

---

# 15. Suggested System Structure

A clean application structure would consist of the following major modules:

```text
Authentication
    ├── Login
    ├── User Profile
    └── Role Management

Dashboard
    ├── Group Overview
    ├── Financial Summary
    ├── Charts
    └── Recent Activity

Businesses
    ├── Business List
    ├── Create Business
    ├── Edit Business
    └── Business Financial Overview

Financial Records
    ├── Income
    ├── Expenses
    ├── All Transactions
    ├── Transaction Details
    └── Maker–Checker Workflow

Financial Accounts
    ├── Bank Accounts
    ├── Cash in Hand
    └── Account Transactions

Reports
    ├── Monthly
    ├── Yearly
    ├── All Time
    ├── Business Reports
    └── Retained Earnings

Approval Center
    ├── Pending Records
    ├── Approved Records
    └── Rejected Records

Audit Logs
    └── Financial Activity History
```

## 16. Overall Workflow

The overall financial workflow will be:

**Business / Account Setup**
↓
**Maker creates financial transaction**
↓
**Transaction saved as Draft**
↓
**Maker submits transaction**
↓
**Transaction becomes Pending Review**
↓
**Checker reviews transaction**
↓
**Approve / Reject**
↓
**Approved transaction updates financial balances**
↓
**Transaction becomes part of financial reports**
↓
**Dashboard and retained earnings are recalculated**

This architecture gives The Golden 7 Myanmar Group a centralized, controlled, and auditable financial management system while keeping the initial implementation focused on the group's core **income, expense, bank, cash, business, approval, and reporting requirements**.
