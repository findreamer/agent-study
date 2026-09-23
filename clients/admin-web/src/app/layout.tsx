import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RBAC 管理后台',
  description: 'RBAC 后台管理系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
