# Dashboard reporting

Day, Week, Month, and All time select one range across the financial cards, activity counts, cash-flow chart, service revenue, breakdown table, recent receipts, and new-order list. Choose a date or use previous/next to inspect history. Weeks start Monday. The current week/month ends today, and the date range is shown explicitly. All business dates use Asia/Kolkata. The breakdown independently groups the same selected range by day, week, or month; CSV exports all buckets rather than the visible page of eight rows.

The current wallet always sums the complete ledger. Revenue includes payment, purged_payment, and purged_recorded_sale ledger types; it does not add order quotes or recorded-sale rows again. Expense and withdrawal figures are ledger debits recorded in the selected range. Operating surplus is revenue minus expense debits, before withdrawals. Adjustments and net wallet movement are shown separately. Comparisons use the previous day or the same elapsed calendar days of the prior week/month; current-day figures compare against a full prior day, not an equal-hour interval.

New orders use created_at, production uses completed_at, delivery uses delivered_at, and new customers use registration time. These events may occur in different periods. Imported customer registration dates may be later than their original relationship. The monthly goal always uses the current business month regardless of the report selection.

Live priorities are independent of the report date: overdue, due today, ready to deliver, payment proofs, and finance approvals. Uncollected order value is an estimate from quoted prices less recorded confirmed payments, excluding cancelled, confirmed, and refunded orders; it is not a verified receivables ledger. The order pipeline counts the current status of all nondeleted orders. Actions open the relevant order/filter or ledger. Current wallet and queues show an offline warning when data is cached.

The redesign changes only frontend reporting and navigation. It does not update orders, customer details, payments, wallet entries, or database schema.
