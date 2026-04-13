import { redirect } from "next/navigation";

export default async function LoginRedirectPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const nextParam = Array.isArray(params?.next) ? params.next[0] : params?.next;
  const target = nextParam ? `/trainer-zugang?next=${encodeURIComponent(nextParam)}` : "/trainer-zugang";
  redirect(target);
}
