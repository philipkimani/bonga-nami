import express from "express";

export const paymentsRouter = express.Router();

// ============================================================================
// M-Pesa STK Push Callback
// ============================================================================
//
// TODO: Complete implementation checklist:
//   1. Validate M-Pesa callback signature/origin to prevent spoofed callbacks
//   2. Extract CheckoutRequestID, ResultCode, and Amount from the callback body
//   3. Update the corresponding payment record in the database (match on CheckoutRequestID)
//   4. Handle duplicate callbacks (idempotency) — M-Pesa may retry delivery
//   5. Emit events or notify the relevant chat session of payment status
//
// The ResultCode: 0 response MUST always be returned — required by M-Pesa protocol
// to acknowledge receipt, regardless of internal processing outcome.
// ============================================================================

paymentsRouter.post("/mpesa/callback", (req: any, res: any) => {
  const body = req.body;

  // Basic structural validation of the callback body
  if (!body || typeof body !== "object") {
    console.log("[payments] MPesa callback received with invalid body");
    // Still return success to M-Pesa to prevent retries of malformed requests
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  // Extract only non-sensitive fields for logging.
  // SECURITY: Do NOT log phone numbers, amounts, or other PII from M-Pesa callbacks.
  const stkCallback = body?.Body?.stkCallback || {};
  const summary = {
    CheckoutRequestID: stkCallback.CheckoutRequestID || "unknown",
    ResultCode: stkCallback.ResultCode ?? "unknown",
    ResultDesc: stkCallback.ResultDesc || "unknown",
  };

  console.log("[payments] MPesa callback received:", JSON.stringify(summary));

  // TODO: Process payment result — update DB record, notify session, etc.
  // For now this is a no-op acknowledging receipt.

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});
