export function formatMoney(amount, currency, symbol) {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${formatted} ${currency || ""}`.trim();
}

export function money(amount, currency) {
  return formatMoney(amount, currency);
}
