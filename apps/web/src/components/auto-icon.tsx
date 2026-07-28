import type { LucideProps } from "lucide-react";

export default function AutoRickshaw({
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
      <circle cx="7" cy="17.5" r="2.4" />
      <circle cx="15.5" cy="17.5" r="2.4" />
      <path d="M4.5 15V7a3 3 0 0 1 3-3h7.5a2.5 2.5 0 0 1 2.3 1.5l2 4.3a3 3 0 0 1 .2 1.2v4" />
      <path d="M4.5 15h14.5" />
      <path d="M10 4v6" />
    </svg>
  );
}
