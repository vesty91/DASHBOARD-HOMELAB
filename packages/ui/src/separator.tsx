import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("ui-separator", className)} {...props} />;
}
