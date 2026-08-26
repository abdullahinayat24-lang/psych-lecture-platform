"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const role = (session?.user as any)?.role;
  const isTeacher = role === "TEACHER";
  const isLoginPage = pathname === "/login";

  return (
    <header
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0.75rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link
            href={session ? "/dashboard" : "/"}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--color-text)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🏛️ City College Sambrial</span>
          </Link>

          {isLoginPage && (
            <Link href="/" style={{ fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
              ← Back to Home
            </Link>
          )}

          {/* Navigation Links */}
          {session && (
            <nav style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <NavLink href="/dashboard" active={pathname === "/dashboard"}>
                Dashboard
              </NavLink>
              <NavLink href="/lectures" active={pathname.startsWith("/lectures")}>
                Lectures
              </NavLink>
              <NavLink href="/topics" active={pathname.startsWith("/topics")}>
                Knowledge Graph
              </NavLink>
              <NavLink href="/lexicon" active={pathname.startsWith("/lexicon")}>
                Lexicon &amp; Slang
              </NavLink>
              <NavLink href="/search" active={pathname === "/search"}>
                Search
              </NavLink>
              {isTeacher && (
                <NavLink href="/teacher/record" active={pathname === "/teacher/record"}>
                  <span style={{ color: "#d9534f" }}>●</span> Record Studio
                </NavLink>
              )}
            </nav>
          )}
        </div>

        {/* User / Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            onClick={toggleTheme}
            className="sm"
            style={{ padding: "0.35rem 0.6rem" }}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>

          {session ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ textAlign: "right", fontSize: "0.82rem" }} className="hide-mobile">
                <div style={{ fontWeight: 600 }}>{session.user?.name || (session.user as any)?.username}</div>
                <span className={`badge ${isTeacher ? "tag-source" : "tag-interpretation"}`}>
                  {isTeacher ? "TEACHER" : "STUDENT"}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login">
              <button className="primary sm">Sign in</button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: "0.35rem 0.75rem",
        borderRadius: "var(--radius)",
        fontSize: "0.88rem",
        fontWeight: 600,
        color: active ? "#ffffff" : "var(--color-text-muted)",
        background: active ? "#000000" : "transparent",
        textDecoration: "none",
        transition: "all 0.15s ease",
      }}
    >
      {children}
    </Link>
  );
}
