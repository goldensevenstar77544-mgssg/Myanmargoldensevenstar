import { cn } from "@/lib/utils";
import { LoadingDots } from "@/components/ui/loading-dots";

const variantClass = {
  screen: "flex min-h-screen items-center justify-center",
  page: "flex items-center justify-center px-4 py-12",
  inline: "flex items-center justify-center py-8",
} as const;

type LoadingStateProps = {
  variant?: keyof typeof variantClass;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function LoadingState({
  variant = "inline",
  size = "md",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn(variantClass[variant], "text-zinc-500", className)}>
      <LoadingDots size={size} />
    </div>
  );
}
