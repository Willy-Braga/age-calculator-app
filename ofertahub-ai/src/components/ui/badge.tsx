import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/12 text-primary",
      violet: "border-transparent bg-violet/12 text-violet",
      success: "border-transparent bg-success/12 text-success",
      warning: "border-transparent bg-warning/15 text-warning",
      danger: "border-transparent bg-danger/12 text-danger",
      muted: "border-transparent bg-muted text-muted-foreground",
      outline: "text-foreground",
      demo: "border-warning/40 bg-warning/15 text-warning font-bold tracking-wide",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
