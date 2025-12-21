import { loadStripe } from "@stripe/stripe-js";

const rawFunctionsBase = (import.meta.env.VITE_FUNCTIONS_URL || "").replace(/\/$/, "");

export const functionsBase =
  rawFunctionsBase || (import.meta.env.DEV ? "http://localhost:8888" : "");

export const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const stripePromise = stripeKey ? loadStripe(stripeKey) : null;
