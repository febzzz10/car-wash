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
      <path d="M3 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1H3Z" />
      <path d="M7 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2V9H7Z" />
      <path d="M12 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1h-5Z" />
      <line x1="3" x2="22" y1="8" y2="8" />
      <path d="M16 8V5a2 2 0 0 0-2-2h-3a2 2 0 0 0-1.857 1.257L7 8" />
      <line x1="6" x2="6" y1="17" y2="20" />
      <line x1="9" x2="9" y1="17" y2="20" />
      <line x1="14" x2="14" y1="17" y2="20" />
    </svg>
  );
}
