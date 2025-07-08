/**
 * Formats a Brazilian phone number with +55 country code
 * @param {string} phone - The phone number to format
 * @returns {string} Formatted phone number in international format
 */
export function formatBrazilianPhoneIntl(phone) {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Check if number already includes country code
  const hasCountryCode = digits.startsWith("55");
  const localDigits = hasCountryCode ? digits.substring(2) : digits;

  // Validate length (8 digits for landline, 9 for mobile)
  if (localDigits.length < 10 || localDigits.length > 11) {
    return phone; // return original if invalid
  }

  // Extract components
  const ddd = localDigits.substring(0, 2);
  const isMobile = localDigits.length === 11;
  const prefix = isMobile
    ? localDigits.substring(2, 7)
    : localDigits.substring(2, 6);
  const suffix = isMobile ? localDigits.substring(7) : localDigits.substring(6);

  // Format with country code
  return `+55 (${ddd}) ${prefix}-${suffix}`;
}
