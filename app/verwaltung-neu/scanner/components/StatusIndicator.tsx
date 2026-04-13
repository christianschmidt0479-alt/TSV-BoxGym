type StatusIndicatorProps = {
  status: string;
};
export default function StatusIndicator({ status }: StatusIndicatorProps) {
  let color = "text-gray-500";
  if (status === "ok") color = "text-green-600";
  if (status === "error") color = "text-red-600";
  if (status === "busy") color = "text-yellow-600";
  return (
    <div className={`mb-4 font-mono ${color}`}>Status: {status}</div>
  );
}
