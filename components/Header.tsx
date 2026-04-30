import { resolveUserContext } from "@/lib/resolveUserContext"
import { HeaderClient } from "./HeaderClient"

export default async function Header() {
  const user = await resolveUserContext()

  return (
    <header data-app-header>
      <HeaderClient user={user} />
    </header>
  )
}
