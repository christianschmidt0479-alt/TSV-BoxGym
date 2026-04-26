import type { CSSProperties } from "react"

export const container: CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
}

export const title: CSSProperties = {
  fontWeight: 600,
  fontSize: 18,
}

export const card: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
}

export const buttonPrimary: CSSProperties = {
  background: "#16a34a",
  color: "#fff",
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
}

export const buttonSecondary: CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  padding: "6px 12px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
}

export const buttonOutline: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "#000",
}
