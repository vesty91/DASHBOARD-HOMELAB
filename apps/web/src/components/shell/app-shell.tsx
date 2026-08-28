"use client";

import { DropdownItem, DropdownMenu, IconButton, Tooltip } from "@dashboard/ui";
import {
  AppWindow,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  UserRound,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import type { ShellNav, ShellUser } from "./get-shell-context";

function initials(user: ShellUser): string {
  const source = (user.displayName ?? user.username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || user.username.slice(0, 2)).toUpperCase();
}

function contextFromPath(pathname: string): string | null {
  if (pathname === "/") return "Accueil";
  if (/^\/boards\/[^/]+/.test(pathname)) return "Boards";
  if (/^\/apps\/.+/.test(pathname)) return "Apps";
  if (/^\/integrations\/.+/.test(pathname)) return "Intégrations";
  if (pathname.startsWith("/account")) return "Compte";
  return null;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  nav,
  children,
}: {
  user: ShellUser | null;
  nav: ShellNav;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const contextTitle = contextFromPath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("homelab-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("ui-scroll-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("ui-scroll-lock");
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("homelab-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const displayName = user ? (user.displayName ?? user.username) : null;
  const showAdmin = nav.users || nav.groups;

  const link = (href: string, label: string, icon: ReactNode) => {
    const active = isActive(pathname, href);
    const item = (
      <Link
        href={href}
        className="shell-nav-link"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={() => setMobileOpen(false)}
      >
        {icon}
        <span className="shell-nav-label">{label}</span>
      </Link>
    );
    return collapsed ? (
      <Tooltip key={href} label={label}>
        {item}
      </Tooltip>
    ) : (
      <span key={href}>{item}</span>
    );
  };

  return (
    <div
      className="shell"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-open={mobileOpen ? "true" : "false"}
    >
      <a className="shell-skip ui-btn ui-btn-primary" href="#contenu-principal">
        Aller au contenu
      </a>
      <button
        type="button"
        className="shell-backdrop"
        aria-label="Fermer la navigation"
        onClick={() => setMobileOpen(false)}
      />
      <aside className="shell-sidebar" id="navigation-principale">
        <div className="shell-brand">
          <span className="shell-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="shell-brand-copy">
            Homelab
            <small>Dashboard</small>
          </span>
          <IconButton
            label="Fermer la navigation"
            className="shell-close-drawer"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </IconButton>
        </div>
        <nav className="shell-nav" aria-label="Navigation principale">
          <div className="shell-nav-section">
            {link("/", "Accueil", <LayoutDashboard />)}
            {nav.boards ? link("/boards", "Boards", <LayoutGrid />) : null}
            {nav.apps ? link("/apps", "Apps", <AppWindow />) : null}
            {nav.integrations ? link("/integrations", "Intégrations", <Plug />) : null}
          </div>
          {showAdmin ? (
            <div className="shell-nav-section">
              <p className="shell-nav-section-label">Administration</p>
              {nav.users ? link("/admin/users", "Utilisateurs", <Users />) : null}
              {nav.groups ? link("/admin/groups", "Groupes", <UsersRound />) : null}
            </div>
          ) : null}
          {nav.account ? (
            <div className="shell-nav-section">
              <p className="shell-nav-section-label">Compte</p>
              {link("/account/security", "Compte", <UserRound />)}
            </div>
          ) : null}
        </nav>
        <div className="shell-sidebar-footer">
          <IconButton
            label={collapsed ? "Étendre la navigation" : "Réduire la navigation"}
            onClick={toggleCollapsed}
            className="shell-collapse"
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        </div>
      </aside>
      <div className="shell-main">
        <header className="shell-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <IconButton
              label="Ouvrir la navigation"
              className="shell-menu-toggle"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </IconButton>
            {contextTitle ? <p className="shell-topbar-title">{contextTitle}</p> : null}
          </div>
          {user && displayName ? (
            <DropdownMenu
              trigger={
                <button type="button" className="shell-user" aria-haspopup="menu">
                  <span className="shell-avatar">{initials(user)}</span>
                  <span className="shell-user-name">{displayName}</span>
                </button>
              }
            >
              <DropdownItem href="/account/security">Compte</DropdownItem>
              <DropdownItem onSelect={() => void signOut({ callbackUrl: "/login" })}>
                Déconnexion
              </DropdownItem>
            </DropdownMenu>
          ) : (
            <Link className="ui-btn ui-btn-primary" href="/login">
              Connexion
            </Link>
          )}
        </header>
        <main id="contenu-principal" className="shell-content">
          {children}
        </main>
      </div>
    </div>
  );
}
