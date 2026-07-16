"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useFavorites } from "@/lib/use-favorites";

/**
 * 收藏夹 Context 拆分：State / Actions
 *
 * 拆分动机：原 FavoritesContext 把状态和动作塞进同一个 value，任何 favorites
 * 变化都会让所有消费方重渲染（即使只用了 toggleFavorite）。拆分后：
 *   - StateContext：favorites / count / isFavorite 等，随状态变化
 *   - ActionsContext：toggleFavorite / clearFavorites，引用永远稳定
 *
 * 旧的 useFavoritesContext() 作为兼容组合 hook 保留，已有消费方与测试无需改动。
 * 新代码应优先使用 useFavoritesState() / useFavoritesActions() 精确订阅。
 */

type FavoritesState = {
  favorites: Set<string>;
  favoriteIds: string[];
  count: number;
  mounted: boolean;
  isAuthenticated: boolean;
  isFavorite: (linkId: string) => boolean;
};

type FavoritesActions = {
  toggleFavorite: (linkId: string) => void;
  clearFavorites: () => void;
};

const FavoritesStateContext = createContext<FavoritesState | null>(null);
const FavoritesActionsContext = createContext<FavoritesActions | null>(null);

type FavoritesMembershipStore = {
  has: (linkId: string) => boolean;
  subscribe: (linkId: string, listener: () => void) => () => void;
  update: (next: Set<string>) => void;
};

function createFavoritesMembershipStore(initial: Set<string>): FavoritesMembershipStore {
  let current = initial;
  const listeners = new Map<string, Set<() => void>>();
  return {
    has: (linkId) => current.has(linkId),
    subscribe: (linkId, listener) => {
      const linkListeners = listeners.get(linkId) ?? new Set<() => void>();
      linkListeners.add(listener);
      listeners.set(linkId, linkListeners);
      return () => {
        linkListeners.delete(listener);
        if (linkListeners.size === 0) listeners.delete(linkId);
      };
    },
    update: (next) => {
      const previous = current;
      current = next;
      for (const [linkId, linkListeners] of listeners) {
        if (previous.has(linkId) === next.has(linkId)) continue;
        for (const listener of linkListeners) listener();
      }
    },
  };
}

const FavoritesMembershipContext = createContext<FavoritesMembershipStore | null>(null);

/** 兼容旧消费方的组合类型（state ∪ actions） */
type FavoritesContextType = FavoritesState & FavoritesActions;

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const {
    favorites,
    favoriteIds,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    count,
    mounted,
    isAuthenticated,
  } = useFavorites();
  // useState 惰性初始化只跑一次 createFavoritesMembershipStore，
  // 不读 ref.current，满足 eslint-plugin-react-hooks 约束。
  const [membershipStore] = useState<FavoritesMembershipStore>(() =>
    createFavoritesMembershipStore(favorites)
  );

  useLayoutEffect(() => {
    membershipStore.update(favorites);
  }, [favorites, membershipStore]);

  // State 切片：随 favorites 变化
  const state = useMemo<FavoritesState>(
    () => ({
      favorites,
      favoriteIds,
      count,
      mounted,
      isAuthenticated,
      isFavorite,
    }),
    [favorites, favoriteIds, count, mounted, isAuthenticated, isFavorite],
  );

  // Actions 切片：toggleFavorite / clearFavorites 在 useFavorites 内部已 useCallback，
  // 引用稳定，不会随 favorites 变化而更新。
  const actions = useMemo<FavoritesActions>(
    () => ({ toggleFavorite, clearFavorites }),
    [toggleFavorite, clearFavorites],
  );

  return (
    <FavoritesStateContext.Provider value={state}>
      <FavoritesActionsContext.Provider value={actions}>
        <FavoritesMembershipContext.Provider value={membershipStore}>
          {children}
        </FavoritesMembershipContext.Provider>
      </FavoritesActionsContext.Provider>
    </FavoritesStateContext.Provider>
  );
}

/** 仅订阅状态切片（favorites / count / isFavorite 等） */
export function useFavoritesState(): FavoritesState {
  const ctx = useContext(FavoritesStateContext);
  if (!ctx) throw new Error("useFavoritesState must be used within FavoritesProvider");
  return ctx;
}

/** 仅订阅动作切片（toggleFavorite / clearFavorites）—— 引用永远稳定 */
export function useFavoritesActions(): FavoritesActions {
  const ctx = useContext(FavoritesActionsContext);
  if (!ctx) throw new Error("useFavoritesActions must be used within FavoritesProvider");
  return ctx;
}

/** Subscribe to one link membership without re-rendering for unrelated favorites. */
export function useFavoriteMembership(linkId: string): boolean {
  const store = useContext(FavoritesMembershipContext);
  if (!store) throw new Error("useFavoriteMembership must be used within FavoritesProvider");
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(linkId, listener),
    [linkId, store]
  );
  const getSnapshot = useCallback(() => store.has(linkId), [linkId, store]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * 兼容组合 hook：同时订阅 state + actions。
 *
 * 旧消费方（LinkCard / ToolQuickView / Header / FavoritesView）和测试 mock 都
 * 调用此 hook。新代码应优先使用 useFavoritesState() / useFavoritesActions()。
 */
export function useFavoritesContext(): FavoritesContextType {
  const state = useContext(FavoritesStateContext);
  const actions = useContext(FavoritesActionsContext);
  if (!state || !actions) {
    throw new Error("useFavoritesContext must be used within FavoritesProvider");
  }
  return { ...state, ...actions };
}
