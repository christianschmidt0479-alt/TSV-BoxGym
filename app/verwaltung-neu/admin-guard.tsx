
import { cookies } from "next/headers";
import { TRAINER_SESSION_COOKIE, verifyTrainerSessionToken } from "@/lib/authSession";
import { redirect } from "next/navigation";

export default async function AdminGuard({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get?.(TRAINER_SESSION_COOKIE);
  const session = await verifyTrainerSessionToken(sessionCookie?.value);
  const isAdmin = session?.role === "admin" || session?.accountRole === "admin";
  if (!isAdmin) {
    redirect("/trainer-zugang?next=/verwaltung-neu");
  }
  return <>{children}</>;
}
