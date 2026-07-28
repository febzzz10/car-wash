import type { LucideProps } from "lucide-react";

export default function Motorcycle({
  size = 24,
  className,
  "aria-hidden": ariaHidden,
}: LucideProps) {
  return (
    <svg
      aria-hidden={ariaHidden ?? true}
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="6" cy="16" r="3" />
      <circle cx="18" cy="16" r="3" />
      <path d="M6 16h3l2-4h3l1.5-3H11" />
      <path d="M16 16h2" />
      <path d="M14 8h3a3 3 0 0 1 3 3v1" />
      <line x1="6" x2="6" y1="19" y2="20" />
      <line x1="18" x2="18" y1="19" y2="20" />
    </svg>
  );
}
