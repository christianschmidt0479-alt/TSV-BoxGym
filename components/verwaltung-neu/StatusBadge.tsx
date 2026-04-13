import React from "react";

export type StatusBadgeProps = {
  color: "green" | "yellow" | "red";
  children: React.ReactNode;
  className?: string;
};

export function StatusBadge({ color, children, className = "" }: StatusBadgeProps) {
  let bg = "";
  let text = "";
  let border = "";
  switch (color) {
    case "green":
      bg = "bg-emerald-100";
      text = "text-emerald-800";
      border = "border-emerald-200";
      break;
    case "yellow":
      bg = "bg-yellow-100";
      text = "text-yellow-900";
      border = "border-yellow-200";
      break;
    case "red":
      bg = "bg-red-100";
      text = "text-red-800";
      border = "border-red-200";
      break;
  }
  return (
    <span
      className={`inline-block text-xs font-semibold rounded px-2 py-1 border ${bg} ${text} ${border} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
