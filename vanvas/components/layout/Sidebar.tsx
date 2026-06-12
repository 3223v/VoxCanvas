"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "主页", icon: "⌂" },
  { href: "/my", label: "我的", icon: "▦" },
  { href: "/paint", label: "绘画", icon: "✎" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`
        relative flex flex-col bg-white border-r border-zinc-200 h-full overflow-y-auto
        transition-all duration-300 ease-in-out shrink-0
        ${collapsed ? "w-14" : "w-52"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-zinc-100">
        {!collapsed && (
          <span className="text-sm font-medium tracking-widest text-zinc-400 uppercase select-none">
            VoxCanvas
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-8 h-8 rounded-md
                     text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100
                     transition-colors cursor-pointer ml-auto"
          title={collapsed ? "展开导航" : "收起导航"}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                transition-all duration-200 group cursor-pointer
                ${isActive
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                }
              `}
            >
              <span className="text-lg leading-none w-5 text-center shrink-0">
                {item.icon}
              </span>
              <span
                className={`
                  whitespace-nowrap overflow-hidden transition-all duration-300
                  ${collapsed ? "w-0 opacity-0" : "w-auto opacity-100"}
                `}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer decorative line */}
      <div className="mx-3 mb-3 border-t border-zinc-100" />
    </aside>
  );
}
