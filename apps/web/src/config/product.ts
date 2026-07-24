const productName = import.meta.env.VITE_PRODUCT_NAME?.trim() || 'NOVA Connect';
const productShortName = import.meta.env.VITE_PRODUCT_SHORT_NAME?.trim() || productName.split(/\s+/)[0] || 'NOVA';
const configuredMark = import.meta.env.VITE_PRODUCT_MARK?.trim();

export const product = Object.freeze({
  name: productName,
  shortName: productShortName,
  mark: configuredMark?.slice(0, 2).toUpperCase() || productShortName.slice(0, 1).toUpperCase(),
  legalName: import.meta.env.VITE_LEGAL_NAME?.trim() || productName,
  legalEmail: import.meta.env.VITE_LEGAL_EMAIL?.trim() || 'novaconnect.verify@gmail.com',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'novaconnect.verify@gmail.com',
  statusUrl: import.meta.env.VITE_STATUS_URL?.trim() || '',
  termsEffectiveDate: import.meta.env.VITE_TERMS_EFFECTIVE_DATE?.trim() || '2026-07-24',
});
