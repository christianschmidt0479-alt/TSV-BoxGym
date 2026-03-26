export function getQrAccessToken() {
  const token = process.env.QR_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new Error("Missing QR_ACCESS_TOKEN")
  }

  return token
}

export function buildQrAccessUrl(origin: string, panel: "member" | "trial" = "member") {
  const token = getQrAccessToken()
  const query = `?gym=${encodeURIComponent(token)}&panel=${panel}`
  return `${origin.replace(/\/+$/, "")}/${query}`
}
