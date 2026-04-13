type ScanResultListProps = {
  results: Array<any>;
};
export default function ScanResultList({ results }: ScanResultListProps) {
  if (!results.length) return null;
  return (
    <div className="mt-6">
      <h2 className="font-semibold mb-2">Scan-Ergebnisse</h2>
      <ul className="space-y-2">
        {results.map((r, i) => (
          <li key={i} className="border rounded p-2 bg-white shadow-sm">
            {JSON.stringify(r)}
          </li>
        ))}
      </ul>
    </div>
  );
}
