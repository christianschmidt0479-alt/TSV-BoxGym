import { getOpenDeletionRequestsWithMemberData } from "@/lib/adminMemberDeletionRequests"
import { approveOrRejectMemberDeletionRequest } from "./actions"

export default async function AdminMemberDeletionRequestsPage() {
  const requests = await getOpenDeletionRequestsWithMemberData()
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Offene Mitglieder-Löschanträge</h1>
      <table className="min-w-full border border-zinc-200 rounded-xl bg-white">
        <thead>
          <tr className="bg-zinc-100">
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">E-Mail</th>
            <th className="p-2 text-left">Antragsdatum</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 ? (
            <tr><td colSpan={5} className="p-4 text-center text-zinc-500">Keine offenen Anträge.</td></tr>
          ) : requests.map((req) => (
            <tr key={req.id} className="border-t">
              <td className="p-2">{req.member.first_name} {req.member.last_name}</td>
              <td className="p-2">{req.member.email}</td>
              <td className="p-2">{new Date(req.requested_at).toLocaleString("de-DE")}</td>
              <td className="p-2 font-semibold text-blue-700">{req.status}</td>
              <td className="p-2">
                <form action={approveOrRejectMemberDeletionRequest} method="POST" className="flex gap-2">
                  <input type="hidden" name="requestId" value={req.id} />
                  <button type="submit" name="action" value="approve" className="rounded bg-green-600 px-3 py-1 text-white hover:bg-green-700">Genehmigen</button>
                  <button type="submit" name="action" value="reject" className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700">Ablehnen</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
