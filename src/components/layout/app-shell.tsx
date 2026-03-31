'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/home', label: 'ホーム', icon: Home },
  { href: '/study', label: '学習', icon: BookOpen },
  { href: '/settings', label: '設定', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-[100dvh] flex-col lg:flex-row">
      {/* Sidebar (PC) */}
      <nav className="hidden lg:flex flex-col w-56 border-r border-border bg-background">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">Anki Reset</h1>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted dark:hover:bg-gray-800',
                )}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Bottom nav (tablet / mobile) */}
      <nav className="lg:hidden flex border-t border-border bg-background">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon size={22} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
