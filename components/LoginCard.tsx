import { ErrorBox } from "./ErrorBox"

type Props = {
  title: string
  children: React.ReactNode
  error?: string
}

export default function LoginCard({ title, children, error }: Props) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-md rounded-[24px] border border-[#d8e3ee] bg-white px-5 py-5 shadow-sm space-y-4 [&_button[type=submit]]:h-16 [&_button[type=submit]]:rounded-2xl">
        <div className="flex justify-center pb-1">
          <img src="/logo.png" className="h-12 w-auto" alt="TSV BoxGym" />
        </div>

        <h1 className="text-2xl font-semibold text-zinc-900">
          {title}
        </h1>

        <p className="text-sm text-zinc-600">
          Bitte melde dich an
        </p>

        <ErrorBox message={error} />

        {children}
      </div>
    </div>
  )
}
