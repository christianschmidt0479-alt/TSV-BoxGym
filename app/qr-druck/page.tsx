import QrPrintClient from "./print-client"

type QrPrintPageProps = {
  searchParams?: Promise<{ scope?: string }>
}

export default async function QrPrintPage({ searchParams }: QrPrintPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {}

  return <QrPrintClient initialScope={resolvedSearchParams.scope ?? "all"} />
}