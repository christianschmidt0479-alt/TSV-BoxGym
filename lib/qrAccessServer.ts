export function getQrAccessToken() {
  const token = process.env.QR_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new Error("Missing QR_ACCESS_TOKEN")
  }

  return token
}

export function buildQrAccessUrl(origin: string, panel: "member" | "trial" = "member") {
  const token = getQrAccessToken()
  const path = panel === "trial" ? "/checkin/probetraining" : "/checkin/mitglied"
  return `${origin.replace(/\/+$/, "")}${path}?gym=${encodeURIComponent(token)}`
}

export function tryBuildQrAccessUrl(origin: string, panel: "member" | "trial" = "member") {
  const token = process.env.QR_ACCESS_TOKEN?.trim()
  if (!token) {
    return ""
  }

  const path = panel === "trial" ? "/checkin/probetraining" : "/checkin/mitglied"
  return `${origin.replace(/\/+$/, "")}${path}?gym=${encodeURIComponent(token)}`
}
