"use client";

import { memo } from "react";
import { Heart } from "lucide-react";
import {
  useFavoritesActions,
  useFavoritesState,
} from "@/components/FavoritesProvider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * 独立订阅 isFavorite(id)，避免整卡随任意收藏变更重渲染。
 */
function FavoriteButtonComponent({ linkId }: { linkId: string }) {
  const { favorites } = useFavoritesState();
  const { toggleFavorite } = useFavoritesActions();
  const fav = favorites.has(linkId);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(linkId);
          }}
          className="shrink-0 text-[var(--paper-faint)]"
          aria-label={fav ? "取消收藏" : "添加收藏"}
          aria-pressed={fav}
        >
          <Heart
            className={cn(
              "size-3.5 transition-all",
              fav && "fill-[var(--paper-accent)] text-[var(--paper-accent)]"
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{fav ? "取消收藏" : "添加收藏"}</TooltipContent>
    </Tooltip>
  );
}

export const FavoriteButton = memo(FavoriteButtonComponent);
