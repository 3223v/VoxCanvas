'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '主页', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  )},
  { href: '/my', label: '我的', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )},
  { href: '/draw', label: '绘画', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  )},
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={`
        fixed left-6 top-1/2 -translate-y-1/2 z-50
        flex flex-col gap-2
        bg-white/95 backdrop-blur-lg
        border border-gray-200/60
        rounded-2xl shadow-lg shadow-black/[0.06]
        transition-all duration-300 ease-in-out
        py-3.5
        ${collapsed ? 'px-2' : 'px-3'}
      `}
      style={{ width: collapsed ? 52 : 176 }}
    >
      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-8 w-full rounded-lg hover:bg-gray-50 transition-colors"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
        >
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>

      {/* 分割线 */}
      <div className="h-px bg-gray-100 mx-1" />

      {/* 导航项 */}
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center justify-center gap-3 h-9 rounded-xl transition-all duration-200
              ${isActive
                ? 'bg-black text-white shadow-md shadow-black/20'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }
            `}
          >
            <span className="flex-shrink-0 leading-none">{item.icon}</span>
            {!collapsed && (
              <span className="text-sm font-medium whitespace-nowrap leading-none">{item.label}</span>
            )}
          </Link>
        );
      })}
    </aside>
  );
}
