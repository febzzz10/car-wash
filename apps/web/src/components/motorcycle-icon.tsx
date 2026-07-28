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
      <circle cx="5.5" cy="17" r="2.8" />
      <circle cx="18.5" cy="17" r="2.8" />
      <path d="M5.5 17 9.8 11h4.4" />
      <path d="M14.2 11 16 7.5" />
      <path d="M16 7.5 18.5 17" />
      <path d="M15.5 7.5h3" />
    </svg>
  );
}
