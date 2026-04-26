import { resolveUserContext } from "@/lib/resolveUserContext"
import { HeaderClient } from "./HeaderClient"

export default async function Header() {
  const user = await resolveUserContext()

  return <HeaderClient user={user} />
}
