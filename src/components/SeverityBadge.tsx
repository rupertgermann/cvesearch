import { SeverityLevel } from "@/lib/types";
import { severityColor, severityDotColor } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: SeverityLevel;
  score?: number;
  version?: string;
  size?: "sm" | "md" | "lg";
}

export default function SeverityBadge({ severity, score, version, size = "md" }: SeverityBadgeProps) {
  const sizeClasses = {
    sm: "badge-xs",
    md: "badge-sm",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`badge font-semibold tracking-wide ${severityColor(severity)} ${sizeClasses[size]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${severityDotColor(severity)} ${
        severity === "CRITICAL" ? "animate-pulse" : ""
      }`} />
      {score !== undefined && <span className="font-mono">{score.toFixed(1)}</span>}
      <span className="uppercase">{severity}</span>
      {version && <span className="opacity-50">v{version}</span>}
    </span>
  );
}
