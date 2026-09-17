// Customer-facing currency display — deliberately the ONLY place currency
// conversion happens. Every backend price a customer sees (product search,
// cart, order review, invoices) is already margin-adjusted AED by the
// time it reaches the frontend, via the existing customer.margin_percent
// pricing logic — nothing about that changes. This module only converts
// that AED number for *display*, per the customer's saved currency
// preference; nothing here is ever sent back to the server or stored.
//
// Fixed rate, per spec: 1 USD = 3.67 AED.
export const USD_PER_AED = 1 / 3.67;

/**
 * Converts an AED amount (already margin-adjusted) to the target
 * currency, rounded to 2 decimals. AED passes through unchanged.
 */
export function convertFromAed(aedAmount, currency) {
  const n = Number(aedAmount) || 0;
  if (currency === "USD") {
    return Math.round(n * USD_PER_AED * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

const SYMBOLS = { AED: "AED", USD: "$" };

/**
 * Formats an AED amount as a customer-facing price string in their
 * chosen currency, e.g. formatCustomerPrice(105, "USD") -> "$28.61",
 * formatCustomerPrice(105, "AED") -> "AED 105.00".
 */
export function formatCustomerPrice(aedAmount, currency = "AED") {
  const converted = convertFromAed(aedAmount, currency);
  const symbol = SYMBOLS[currency] || currency;
  return currency === "USD" ? `${symbol}${converted.toFixed(2)}` : `${symbol} ${converted.toFixed(2)}`;
}
