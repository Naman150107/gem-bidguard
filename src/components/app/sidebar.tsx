"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ScrollText,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/tenders", label: "Tenders", Icon: FileText },
  { href: "/audit", label: "Audit Trail", Icon: ScrollText },
];

export function Sidebar({ officerName }: { officerName: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">GeM BidGuard</div>
          <div className="text-[11px] text-muted-foreground">
            Bid Compliance Verification
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          <UserCircle2 className="h-5 w-5 text-muted-foreground" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-xs font-medium">{officerName}</div>
            <div className="text-[11px] text-muted-foreground">Procurement Officer</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
