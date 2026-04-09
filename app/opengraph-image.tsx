import { ImageResponse } from "next/og"
import { getAppBaseUrl } from "@/lib/mailConfig"

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = "image/png"

export default function OpenGraphImage() {
  const logoUrl = new URL("/boxgym-headline-old.png", getAppBaseUrl()).toString()

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          padding: "48px",
        }}
      >
        <img
          src={logoUrl}
          alt="TSV Falkensee BoxGym"
          width={620}
          height={620}
          style={{
            objectFit: "contain",
          }}
        />
      </div>
    ),
    size,
  )
}