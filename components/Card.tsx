type Props = {
  href: string
  title: string
  subtitle?: string
  icon?: string
}

export default function Card({ href, title, subtitle, icon }: Props) {
  return (
    <a href={href} style={cardStyle}>
      <div style={row}>
        <div style={left}>
          {icon && <div style={iconStyle}>{icon}</div>}
          <div>
            <div style={titleStyle}>{title}</div>
            {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
          </div>
        </div>
        <div style={arrow}>→</div>
      </div>
    </a>
  )
}

const cardStyle = {
  display: "block",
  padding: "16px 18px",
  borderRadius: 12,
  background: "#fff",
  textDecoration: "none",
  color: "#000",
  boxShadow: "0 6px 16px rgba(0,0,0,0.08)"
}

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between"
}

const left = {
  display: "flex",
  alignItems: "center",
  gap: 12
}

const iconStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: "#0b2a4a",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16
}

const titleStyle = {
  fontWeight: 600
}

const subtitleStyle = {
  fontSize: 12,
  color: "#666"
}

const arrow = {
  fontSize: 18,
  color: "#999"
}
