export function formatMoney(minorUnits: number, currency: string = 'USD'): string {
  // Minor units to major (e.g. cents to dollars)
  const major = minorUnits / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(major);
}
