export const LOCAL_APP_BASE_URL = "http://localhost:3000"
export const PRODUCTION_APP_BASE_URL = "https://www.tsvboxgym.de"
export const DEFAULT_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  PRODUCTION_APP_BASE_URL
export const DEFAULT_MAIL_FROM = "TSV BoxGym <info@tsvboxgym.de>"
export const DEFAULT_REPLY_TO = "info@tsvboxgym.de"

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_BASE_URL
}

export function getMailFromAddress() {
  return DEFAULT_MAIL_FROM
}

export function getReplyToAddress() {
  return DEFAULT_REPLY_TO
}

export function getAdminNotificationAddress() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || "info@tsvboxgym.de"
}
