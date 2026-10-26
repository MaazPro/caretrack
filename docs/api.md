# API reference

Base URL: `/api`. Send JSON unless a route says multipart. Protected routes require `Authorization: Bearer <JWT>`. Errors use `{ "message": "...", "details": ... }`; common statuses are 400 validation, 401 authentication, 403 role, 404 not found, 409 duplicate, and 500 server error.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Health response |
| POST | `/auth/register` | Public | Customer registration |
| POST | `/auth/login` | Public | Login |
| GET | `/auth/me` | Any authenticated | Current profile |
| POST | `/claims` | Customer | Create claim with receipt |
| GET | `/claims/my` | Customer | Own claims, filters, stats |
| GET | `/claims/:id` | Customer owner | Own claim detail |
| GET | `/claims/:id/receipt` | Customer owner | Receipt binary |
| GET | `/claims/:id/voucher` | Customer owner | Reimbursement pickup voucher PDF |
| GET | `/admin/claims` | Admin | All claims, filters, stats |
| GET | `/admin/claims/:id` | Admin | Claim detail |
| PATCH | `/admin/claims/:id` | Admin | Status and/or note |
| POST | `/admin/claims/:id/analysis` | Admin | Retry a missing or failed AI assessment |
| GET | `/admin/claims/:id/receipt` | Admin | Receipt binary |
| GET | `/admin/claims/:id/voucher` | Admin | Reimbursement pickup voucher PDF |
| POST | `/admin/claims/:id/reimbursement` | Admin | Issue one pickup voucher |
| POST | `/admin/claims/:id/reimbursement/verify` | Admin | Check voucher code for this claim |
| POST | `/admin/claims/:id/reimbursement/collect` | Admin | Record handover and resolve claim |

Registration example: `POST /auth/register` with `{ "fullName": "Jane Smith", "email": "jane@example.com", "password": "longpassword" }` returns `201` and `{ "user": { "id": "...", "fullName": "Jane Smith", "email": "jane@example.com", "role": "CUSTOMER" }, "token": "..." }`. A supplied `role` is ignored. Login takes `{ "email": "...", "password": "..." }` and returns the same shape; `/auth/me` returns `{ "user": ... }`.

Claim creation uses `multipart/form-data` fields `productName`, `productCategory`, optional `modelNumber`, `purchaseDate` (`YYYY-MM-DD`), `issueDescription`, and required `receipt` (JPEG, PNG, or PDF, at most 5 MB). It returns `201` after persistence with `{ "data": { "_id": "...", "claimNumber": "CT-...", "status": "SUBMITTED", "aiStatus": "PENDING", "statusHistory": [...] } }`. If no Gemini key is configured, `aiStatus` is `UNAVAILABLE`. Subsequent detail/list responses show `COMPLETED` and `aiAnalysis`, or `FAILED` if assessment did not succeed.

List routes accept `page` (default 1), `limit` (default 10, maximum 50), `search`, and `status`. Admin lists also accept `priority` (`LOW`, `MEDIUM`, `HIGH`). Response example: `{ "data": [], "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }, "stats": { "total": 0, "active": 0, "resolved": 0 } }`. Admin stats use `submitted`, `inProgress`, and `resolved`.

Detail routes return `{ "data": { ...claim } }`. Receipt routes return the binary with its original MIME type and inline disposition. Admin update example: `PATCH /admin/claims/:id` with `{ "status": "UNDER_REVIEW", "adminNote": "Checking purchase details" }` returns the updated claim. Status can advance only one step at a time: `SUBMITTED → UNDER_REVIEW → IN_PROGRESS → RESOLVED`.

`POST /admin/claims/:id/analysis` takes no body and returns `202` with the claim in `PENDING` assessment state. It is available for failed, unavailable, legacy, or stale pending assessments; a completed or active assessment returns `409`. If Gemini is not configured, it returns `503`.

`POST /admin/claims/:id/reimbursement` takes `{ "amount": 1250, "currency": "PKR" }` (also `USD`, `EUR`, `GBP`) and returns `201` with the claim. It requires **Under review** or **In progress**, issues a unique voucher, and moves **Under review** to **In progress**. The claim's `reimbursement` includes the amount in minor units, code, mock pickup address, issue time, and `READY_FOR_COLLECTION` status. A second issue returns `409`.

`POST /admin/claims/:id/reimbursement/verify` takes `{ "voucherCode": "CTP-ABCD-1234-EF56-7890" }` and returns `{ "valid": true, "claimNumber": "...", "amountMinor": 125000, "currency": "PKR" }` for a matching pending voucher. Staff then check the customer's original purchase receipt. `POST /admin/claims/:id/reimbursement/collect` takes `{ "voucherCode": "...", "originalReceiptVerified": true }`; it atomically marks the voucher `COLLECTED` and the claim `RESOLVED`. Directly resolving a claim with a pending voucher returns `409`. Voucher downloads require authentication and use private no-store responses. These endpoints record a physical handover attestation and do not transfer funds.
