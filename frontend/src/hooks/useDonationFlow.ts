import { useCallback, useState } from "react";
import { functionsBase, stripeKey } from "../lib/env";

export function useDonationFlow() {
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<number | "">(2);
  const [donatePending, setDonatePending] = useState(false);
  const [donateError, setDonateError] = useState<string | null>(null);
  const [donateClientSecret, setDonateClientSecret] = useState<string | null>(null);
  const [donateStatus, setDonateStatus] = useState<string | null>(null);

  const openDonation = useCallback(() => {
    setDonateError(null);
    setDonateStatus(null);
    setDonateClientSecret(null);
    setDonateOpen(true);
  }, []);

  const closeDonation = useCallback(() => {
    if (donatePending) return;
    setDonateOpen(false);
  }, [donatePending]);

  const createPaymentIntent = useCallback(async () => {
    if (donateAmount === "" || donateAmount < 0.5) {
      setDonateError("Amount must be at least 0.5 NZD.");
      return;
    }
    if (!stripeKey) {
      setDonateError("Missing VITE_STRIPE_PUBLISHABLE_KEY in env.");
      return;
    }

    setDonatePending(true);
    setDonateError(null);
    setDonateStatus(null);

    try {
      const cents = Math.round(donateAmount * 100);

      const res = await fetch(`${functionsBase || ""}/.netlify/functions/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: cents }),
      });

      const data = await res.json();

      if (!res.ok || !data.clientSecret) {
        setDonateError(data.error ?? "Failed to create payment intent.");
        return;
      }

      setDonateClientSecret(data.clientSecret);
      setDonateStatus("Payment intent created. Please enter card details to pay.");
    } catch (e: any) {
      setDonateError(e.message ?? "Unexpected error.");
    } finally {
      setDonatePending(false);
    }
  }, [donateAmount]);

  return {
    donateOpen,
    donateAmount,
    donatePending,
    donateError,
    donateClientSecret,
    donateStatus,
    setDonateAmount,
    setDonateError,
    setDonateStatus,
    openDonation,
    closeDonation,
    createPaymentIntent,
  };
}
