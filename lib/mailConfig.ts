export const LOCAL_APP_BASE_URL = "http://localhost:3000"
export const PRODUCTION_APP_BASE_URL = "https://www.tsvboxgym.de"
export const DEFAULT_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_APP_BASE_URL ||
  process.env.APP_BASE_URL ||
  (process.env.NODE_ENV === "production" ? PRODUCTION_APP_BASE_URL : LOCAL_APP_BASE_URL)
export const DEFAULT_MAIL_FROM = "TSV BoxGym <info@tsvboxgym.de>"

export function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    DEFAULT_APP_BASE_URL
  )
}

export function getMailFromAddress() {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_MAIL_FROM
}

export function getReplyToAddress() {
  return process.env.RESEND_REPLY_TO_EMAIL || "info@tsvboxgym.de"
}

export function getAdminNotificationAddress() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || "info@tsvboxgym.de"
}
