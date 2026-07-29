"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Section nav shared by all system pages: Overview / Map / Learn / Progress.
export default function SystemTabs({ slug, firstLearnTab }: { slug: string; firstLearnTab: string }) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    { href: `${base}/map`, label: "Map", active: pathname.startsWith(`${base}/map`) },
    {
      href: `${base}/learn/${firstLearnTab}`,
      label: "Learn",
      active: pathname.startsWith(`${base}/learn`),
    },
    {
      href: `${base}/progress`,
      label: "Progress",
      active: pathname.startsWith(`${base}/progress`),
    },
  ];
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={t.active ? "active" : ""}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
