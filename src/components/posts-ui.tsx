'use client';

import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from 'react';

// Late-bound handle to the posts window: the window (mounted by the page)
// registers itself, and anything above it in the tree — desktop icons, the
// start-menu bio — can open it without navigating.
export type PostsUI = { openList: () => void; openPost: (slug: string) => void };

const Ctx = createContext<MutableRefObject<PostsUI | null> | null>(null);

export function PostsUIProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PostsUI | null>(null);
  return <Ctx.Provider value={ref}>{children}</Ctx.Provider>;
}

export const usePostsUI = () => useContext(Ctx)!;
