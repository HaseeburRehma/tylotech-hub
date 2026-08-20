"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ChatWidget } from "@/components/chat/chat-widget";
import type { AuthUser } from "@/lib/auth";

export function AppShell({
  children,
  user,
  canSeeInternal,
}: {
  children: React.ReactNode;
  user: AuthUser;
  canSeeInternal: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand/[0.07] blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-info/[0.05] blur-[120px]" />
      </div>

      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen lg:block">
        <Sidebar canSeeInternal={canSeeInternal} userId={user.id} />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 bg-bg lg:hidden"
            >
              <Sidebar canSeeInternal={canSeeInternal} userId={user.id} onNavigate={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} user={user} />
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}
