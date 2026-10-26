# Reimbursement collection flow

Implemented in the claim drawer and API. The document is named **Reimbursement Pickup Voucher**. It authorizes a demonstration collection and does not state that payment has been completed.

1. An admin moves a submitted claim to **Under review**, then enters the approved amount and currency and issues a voucher. A claim already **In progress** can also receive a voucher. Only one voucher can be issued per claim.
2. Issuing the voucher moves an **Under review** claim to **In progress**. The customer account shows the approved amount, unique verification code, mock pickup address, instructions to bring the voucher and original purchase receipt, and a PDF download.
3. At collection, staff enter the voucher code in the admin drawer. The server checks it against that claim's issued voucher. Staff must confirm they checked the original purchase receipt and handed over the approved amount.
4. The collection action records the staff member and time, marks the voucher **Collected**, and moves the claim to **Resolved**. While collection is pending, the ordinary status editor cannot resolve the claim.

The pickup address is fictional and can be changed with `PICKUP_ADDRESS` in the server environment. This flow sends no email and transfers no funds electronically. Receipt verification and handover are staff attestations; CareTrack cannot independently prove a physical handover.
