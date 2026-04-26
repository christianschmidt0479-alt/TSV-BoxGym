import MemberPasswordUpdateGuard from "./MemberPasswordUpdateGuard"

export default function MeinBereichLayout({ children }: { children: React.ReactNode }) {
  return (
    <MemberPasswordUpdateGuard>
      <div>{children}</div>
    </MemberPasswordUpdateGuard>
  )
}
