/**
 * KAVO-SYS · Shared Validation Helpers
 * All functions return true = valid, false = invalid.
 * Phone/email/url return true when empty (optional fields).
 */

export const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const URL_RE   = /^(https?:\/\/)?([\w-]+\.)+[\w]{2,}(\/\S*)?$/i;

// Optional-field validators: pass if empty, fail only on bad format
export const isValidPhone = (v) => !v || PHONE_RE.test(v.trim());
export const isValidEmail = (v) => !v || EMAIL_RE.test(v.trim());
export const isValidUrl   = (v) => !v || URL_RE.test(v.trim());

// Numeric validators
export const isPositive = (v) => { const n = +v; return isFinite(n) && n > 0; };
export const isNonNeg   = (v) => { const n = +v; return isFinite(n) && n >= 0; };
export const isPercent  = (v) => { const n = +v; return isFinite(n) && n >= 0 && n <= 100; };

// String validators
export const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// Error messages
export const MSG = {
  required:    "This field is required",
  phone:       "Invalid phone (e.g. +961 1 234 567)",
  email:       "Invalid email format",
  url:         "Invalid URL format",
  positive:    "Must be greater than 0",
  nonNeg:      "Must be 0 or greater",
  percent:     "Must be between 0 and 100",
  pwdShort:    "Password must be at least 6 characters",
  capacity:    "Capacity must be between 1 and 50",
};
