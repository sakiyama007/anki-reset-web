'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/home', label: 'ホーム', icon: Home },
  { href: '/settings', label: '設定', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-[100dvh] flex-col lg:flex-row">
      <nav className="hidden w-56 flex-col border-r border-border bg-background lg:flex">
        <div className="border-b border-border p-4">
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
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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

      <main className="flex-1 overflow-auto">{children}</main>

      <nav className="flex border-t border-border bg-background lg:hidden">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
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
