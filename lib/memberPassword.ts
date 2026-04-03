export const MEMBER_PASSWORD_REGEX = /^[^\s]{8,64}$/
export const MEMBER_PASSWORD_HINT = "Passwort: 8-64 Zeichen, ohne Leerzeichen. Buchstaben, Zahlen und Sonderzeichen sind erlaubt."
export const MEMBER_PASSWORD_REQUIREMENTS_MESSAGE =
  "Das Passwort muss 8 bis 64 Zeichen lang sein und darf keine Leerzeichen enthalten."

export function normalizeMemberPassword(value: string) {
  return value.trim()
}

export function isValidMemberPassword(value: string) {
  return MEMBER_PASSWORD_REGEX.test(normalizeMemberPassword(value))
}