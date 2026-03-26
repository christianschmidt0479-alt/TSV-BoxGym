export const PIN_REGEX = /^[^\s]{6,16}$/
export const PIN_HINT = "PIN: 6–16 Zeichen, Buchstaben, Zahlen oder Sonderzeichen."
export const PIN_REQUIREMENTS_MESSAGE =
  "Die PIN muss 6 bis 16 Zeichen lang sein. Erlaubt sind Buchstaben, Zahlen oder Sonderzeichen."

export function normalizePin(value: string) {
  return value.trim()
}

export function isValidPin(value: string) {
  return PIN_REGEX.test(normalizePin(value))
}
