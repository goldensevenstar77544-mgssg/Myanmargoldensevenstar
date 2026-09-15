import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "loading-dots--sm",
  md: "loading-dots--md",
  lg: "loading-dots--lg",
} as const;

type LoadingDotsProps = {
  size?: keyof typeof sizeClass;
  className?: string;
};

export function LoadingDots({ size = "md", className }: LoadingDotsProps) {
  return (
    <div
      className={cn("loading-dots", sizeClass[size], className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="loading-dots__ball" aria-hidden>
          <div className="loading-dots__dot" />
        </div>
      ))}
    </div>
  );
}
