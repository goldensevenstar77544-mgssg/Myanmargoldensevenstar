import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  /** Outer frame size classes, e.g. h-9 w-9 */
  sizeClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  className,
  sizeClassName = "h-9 w-9",
  priority,
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-lg bg-white",
        sizeClassName,
        className
      )}
    >
      <Image
        src="/logo-ui.png"
        alt="Golden 7"
        fill
        sizes="48px"
        className="object-contain p-0.5"
        priority={priority}
      />
    </span>
  );
}
