"use client";

import { type NavLink } from "@/lib/types";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function LinkCard({ link }: { link: NavLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <Card className="transition-all duration-200 hover:shadow-md hover:border-ring/50 group-hover:translate-y-[-1px]">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-accent text-xl shadow-sm">
            {link.icon || "🔗"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="truncate font-semibold text-card-foreground group-hover:text-primary transition-colors">
                {link.title}
              </h3>
              {link.featured && (
                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-1.5 py-0">
                  推荐
                </Badge>
              )}
              {link.paid && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0 hover:bg-emerald-200">
                  优选
                </Badge>
              )}
            </div>
            {link.description && (
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                {link.description}
              </p>
            )}
            {link.category_name && (
              <Badge variant="outline" className="mt-2 text-[10px] px-2 py-0 text-muted-foreground font-normal">
                {link.category_name}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
