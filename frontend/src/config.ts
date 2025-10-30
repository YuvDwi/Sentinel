// API Configuration
const ENV_API_URL = (import.meta.env?.VITE_API_URL as string | undefined) || undefined
const RUNTIME_ORIGIN = (typeof window !== 'undefined') ? window.location.origin : undefined

// Prefer explicit VITE_API_URL when provided. In production, default to same-origin.
export const API_URL = ENV_API_URL || (import.meta.env?.PROD ? (RUNTIME_ORIGIN || '') : '') || 'http://localhost:8080'

export const config = {
  apiUrl: API_URL,
  isDevelopment: import.meta.env?.DEV,
  isProduction: import.meta.env?.PROD,
}

