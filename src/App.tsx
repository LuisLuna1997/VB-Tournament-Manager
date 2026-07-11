import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/layout/AppShell';
import { useAutoPush } from '@/lib/use-auto-push';

function App() {
  useAutoPush();

  return (
    <TooltipProvider>
      <AppShell />
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
