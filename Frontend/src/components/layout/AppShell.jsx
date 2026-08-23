import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { PageHeaderProvider } from '../../context/PageHeaderContext';
import { AcademicFilterProvider } from '../../context/AcademicFilterContext';

// Persistent shell for every authenticated screen: fixed sidebar (drawer on mobile) + top
// header + routed page content. Individual pages set the header's title/subtitle/actions via
// usePageHeader() and read/write the semester/session filter via useAcademicFilter().
export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <PageHeaderProvider>
      <AcademicFilterProvider>
        {/*
          Root shell:
          - `h-screen overflow-hidden` on the wrapper so the flex container is
            exactly the viewport — prevents a page-level second scrollbar.
          - The main column uses `overflow-y-auto` so only the content area scrolls.
          - The sidebar uses `sticky top-0 h-screen overflow-hidden` (see Sidebar.jsx)
            so it stays in place without generating its own scrollbar track.
        */}
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <Header onMenuClick={() => setSidebarOpen(true)} />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <Outlet />
            </main>
          </div>
        </div>
      </AcademicFilterProvider>
    </PageHeaderProvider>
  );
}
