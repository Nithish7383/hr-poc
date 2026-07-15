"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/useAuth";

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function DirectoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function OnboardingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function OffboardingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  );
}

function ApprovalsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function AiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a2 2 0 0 1 2 2v1h1a3 3 0 0 1 3 3v1h1a2 2 0 0 1 0 4h-1v1a3 3 0 0 1-3 3h-1v1a2 2 0 0 1-4 0v-1H8a3 3 0 0 1-3-3v-1H4a2 2 0 0 1 0-4h1V8a3 3 0 0 1 3-3h1V4a2 2 0 0 1 2-2Z" />
      <line x1="9" y1="10" x2="9" y2="10" />
      <line x1="15" y1="10" x2="15" y2="10" />
    </svg>
  );
}

function ComplianceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const menu = [
  { href: "/dashboard", label: "Executive Dashboard", icon: DashboardIcon },
  { href: "/directory", label: "Employee Directory", icon: DirectoryIcon },
  { href: "/onboarding-tracker", label: "Onboarding Tracker", icon: OnboardingIcon },
  { href: "/offboarding-tracker", label: "Offboarding Tracker", icon: OffboardingIcon },
  { href: "/approvals", label: "Approval Dashboard", icon: ApprovalsIcon },
  { href: "/ai-decisions", label: "AI Decision Center", icon: AiIcon },
  { href: "/compliance", label: "Compliance Dashboard", icon: ComplianceIcon },
];

export default function Sidebar({
  children,
  collapsed: collapsedProp,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { role, logout } = useAuth();

  // Auto-collapse to icon-only rail on employee profile pages, where the
  // main content benefits from extra width and the sidebar is secondary nav.
  // A page can also opt in explicitly via the `collapsed` prop (e.g. the
  // onboarding tracker detail view), without changing this default for
  // every other page that renders <Sidebar> plainly.
  const autoCollapsed = pathname?.startsWith("/profile/") ?? false;
  const collapsed = collapsedProp ?? autoCollapsed;

  return (
    <div className="bg-[#fafafa]">

      {/* Fixed Sidebar */}
      <aside
        className={`
          fixed
          top-0
          left-0
          h-screen
          ${collapsed ? "w-[72px]" : "w-64"}
          bg-[#101d38]
          text-white
          flex
          flex-col
          shadow-lg
          z-50
          transition-all
          duration-200
        `}
      >
        {/* Logo */}
        <div className={`border-b border-gray-700 ${collapsed ? "px-0 py-6 flex justify-center" : "px-6 py-6"}`}>
          {collapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10 text-sm font-bold text-yellow-500">
              HR
            </div>
          ) : (
            <>
              <p className="text-xs text-yellow-500 tracking-widest">
                PEOPLE OPERATIONS
              </p>
              <h1 className="text-xl font-bold mt-2">
                HR Platform
              </h1>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav
          className={`
            flex-1
            overflow-y-auto
            py-4
            ${collapsed ? "px-2" : "px-3"}
          `}
        >
          {menu.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`
                  flex
                  items-center
                  ${collapsed ? "justify-center px-0" : "gap-3 px-4"}
                  py-3
                  rounded-lg
                  text-sm
                  mb-2
                  transition-colors

                  ${
                    isActive
                      ? "bg-[#243654] text-white"
                      : "text-gray-300 hover:bg-[#243654] hover:text-white"
                  }
                `}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`border-t border-gray-700 ${collapsed ? "px-2 py-4" : "px-5 py-5"}`}>

          {!collapsed && (
            <p className="text-sm text-gray-300 mb-3">
              Logged in as
              <span className="font-semibold text-white ml-1">
                {role}
              </span>
            </p>
          )}

          <button
            onClick={logout}
            title={collapsed ? "Log out" : undefined}
            className={`
              w-full
              flex
              items-center
              ${collapsed ? "justify-center px-0" : "gap-2 text-left px-3"}
              py-2
              rounded-lg
              text-sm
              text-red-400
              hover:bg-[#243654]
              hover:text-red-300
              transition-colors
            `}
          >
            <LogoutIcon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>

        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`
          ${collapsed ? "ml-[72px]" : "ml-64"}
          h-screen
          overflow-y-auto
          bg-[#fafafa]
          p-6
          transition-all
          duration-200
        `}
      >
        {children}
      </main>

    </div>
  );
}