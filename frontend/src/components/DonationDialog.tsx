import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useState } from "react";
import { stripePromise } from "../lib/env";

type DonationDialogProps = {
  open: boolean;
  amount: number | "";
  pending: boolean;
  error: string | null;
  status: string | null;
  clientSecret: string | null;
  onAmountChange: (value: number | "") => void;
  onClose: () => void;
  onCreateIntent: () => void;
  setStatus: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

const QUICK_AMOUNTS = [2, 5, 10];

export function DonationDialog({
  open,
  amount,
  pending,
  error,
  status,
  clientSecret,
  onAmountChange,
  onClose,
  onCreateIntent,
  setStatus,
  setError,
}: DonationDialogProps) {
  if (!open) return null;

  return (
    <div
      className="donate-overlay"
      role="presentation"
      onClick={() => !pending && onClose()}
    >
      <div
        className="habit-form"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Support this app</h2>
        <p style={{ marginTop: 4, marginBottom: 8 }}>
          Choose an amount, create the payment intent, then enter card details to pay.
        </p>

        {!clientSecret && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {QUICK_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="btn"
                  style={{
                    background: amount === v ? "#44b0de" : undefined,
                    borderColor: amount === v ? "#44b0de" : undefined,
                  }}
                  onClick={() => onAmountChange(v)}
                  disabled={pending}
                >
                  ${v}
                </button>
              ))}
            </div>

            <label>
              Custom amount (NZD)
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={amount === "" ? "" : amount}
                onChange={(e) => {
                  const value = e.target.value;
                  onAmountChange(value === "" ? "" : Number(value));
                }}
                disabled={pending}
              />
            </label>
          </>
        )}

        {status && (
          <div className="habit-form-info">{status}</div>
        )}

        {error && (
          <div className="habit-form-error">{error}</div>
        )}

        {clientSecret ? (
          stripePromise ? (
            <Elements
              key={clientSecret}
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <DonatePaymentForm
                onClose={onClose}
                setStatus={setStatus}
                setError={setError}
              />
            </Elements>
          ) : (
            <div className="habit-form-error">
              Missing Stripe publishable key. Set VITE_STRIPE_PUBLISHABLE_KEY to use donations.
            </div>
          )
        ) : (
          <div className="habit-form-actions">
            <button
              className="btn"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={onCreateIntent}
              disabled={pending}
            >
              {pending ? "Processing..." : "Create Payment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DonatePaymentForm({
  onClose,
  setStatus,
  setError,
}: {
  onClose: () => void;
  setStatus: (msg: string | null) => void;
  setError: (msg: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitPending, setSubmitPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) {
      setError("Stripe not ready yet.");
      return;
    }

    setSubmitPending(true);
    setError(null);
    setStatus(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      setError(error.message ?? "Payment failed.");
    } else if (paymentIntent) {
      if (paymentIntent.status === "succeeded") {
        setStatus("Payment succeeded. Thank you!");
        onClose();
      } else {
        setStatus(`Payment status: ${paymentIntent.status}`);
      }
    }

    setSubmitPending(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PaymentElement />
      <div className="habit-form-actions">
        <button
          className="btn"
          type="button"
          onClick={onClose}
          disabled={submitPending}
        >
          Close
        </button>
        <button className="btn primary" type="submit" disabled={submitPending || !stripe}>
          {submitPending ? "Paying..." : "Pay now"}
        </button>
      </div>
    </form>
  );
}
