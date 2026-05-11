import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 ml-0 md:ml-16 lg:ml-60 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-14 md:pb-0">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
