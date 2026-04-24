import { ErrorBox } from "./ErrorBox"

type Props = {
  title: string
  children: React.ReactNode
  error?: string
}

export default function LoginCard({ title, children, error }: Props) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#d8e3ee] p-5 space-y-4 [&_button[type=submit]]:h-11">

        <div className="flex justify-center mb-2">
          <img src="/logo.png" className="h-10" alt="TSV BoxGym" />
        </div>

        <h1 className="text-xl font-semibold text-zinc-900">
          {title}
        </h1>

        <p className="text-sm text-gray-500">
          Bitte melde dich an
        </p>

        <ErrorBox message={error} />

        {children}

      </div>
    </div>
  )
}
