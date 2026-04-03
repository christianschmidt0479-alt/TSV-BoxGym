export const PIN_REGEX = /^[^\s]{8,64}$/
export const PIN_HINT = "Passwort: 8-64 Zeichen, ohne Leerzeichen. Buchstaben, Zahlen und Sonderzeichen sind erlaubt."
export const PIN_REQUIREMENTS_MESSAGE =
  "Das Passwort muss 8 bis 64 Zeichen lang sein und darf keine Leerzeichen enthalten."

export function normalizePin(value: string) {
  return value.trim()
}

export function isValidPin(value: string) {
  return PIN_REGEX.test(normalizePin(value))
}
