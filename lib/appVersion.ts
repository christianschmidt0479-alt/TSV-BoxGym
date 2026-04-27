import pkg from "../package.json"

// IMPORTANT:
// NEXT_PUBLIC_APP_VERSION should NOT be set in production
// Version comes from package.json to avoid build cache issues
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || pkg.version

export const APP_COMMIT = process.env.NEXT_PUBLIC_GIT_SHA || ""
