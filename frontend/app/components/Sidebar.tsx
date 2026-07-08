"use client";
 
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../lib/useAuth";
 
const menu = [
  {
    href: "/dashboard",
    label: "Executive Dashboard",
  },
  {
    href: "/directory",
    label: "Employee Directory",
  },
  {
    href: "/onboarding-tracker",
    label: "Onboarding Tracker",
  },
  {
    href: "/offboarding-tracker",
    label: "Offboarding Tracker",
  },
  {
    href: "/approvals",
    label: "Approval Dashboard",
  },
  {
    href: "/ai-decisions",
    label: "AI Decision Center",
  },
  {
    href: "/compliance",
    label: "Compliance Dashboard",
  },
];
 
export default function Sidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { role, logout } = useAuth();
 
  return (
    <div className="bg-[#fafafa]">
 
      {/* Fixed Sidebar */}
      <aside
        className="
          fixed
          top-0
          left-0
          h-screen
          w-64
          bg-[#101d38]
          text-white
          flex
          flex-col
          shadow-lg
          z-50
        "
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-gray-700">
          <p className="text-xs text-yellow-500 tracking-widest">
            PEOPLE OPERATIONS
          </p>
 
          <h1 className="text-xl font-bold mt-2">
            HR Platform
          </h1>
        </div>
 
        {/* Navigation */}
        <nav
          className="
            flex-1
            overflow-y-auto
            px-3
            py-4
          "
        >
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                block
                px-4
                py-3
                rounded-lg
                text-sm
                mb-2
                transition-colors
 
                ${
                  pathname === item.href
                    ? "bg-[#243654] text-white"
                    : "text-gray-300 hover:bg-[#243654] hover:text-white"
                }
              `}
            >
              {item.label}
            </Link>
          ))}
        </nav>
 
        {/* Footer */}
        <div className="border-t border-gray-700 px-5 py-5">
 
          <p className="text-sm text-gray-300 mb-3">
            Logged in as
            <span className="font-semibold text-white ml-1">
              {role}
            </span>
          </p>
 
          <button
            onClick={logout}
            className="
              w-full
              text-left
              px-3
              py-2
              rounded-lg
              text-sm
              text-red-400
              hover:bg-[#243654]
              hover:text-red-300
              transition-colors
            "
          >
            Log out
          </button>
 
        </div>
      </aside>
 
      {/* Main Content */}
      <main
        className="
          ml-64
          h-screen
          overflow-y-auto
          bg-[#fafafa]
          p-6
        "
      >
        {children}
      </main>
 
    </div>
  );
}