import { BoardPage } from '../board/BoardPage.tsx';
import { Toaster } from '../ui/Toaster.tsx';
import { Landing } from './Landing.tsx';
import { NotFound } from './NotFound.tsx';
import { parseRoute, usePathname } from './router.ts';

export function App() {
  const route = parseRoute(usePathname());
  return (
    <>
      {route.name === 'home' && <Landing />}
      {route.name === 'board' && <BoardPage key={route.id} roomId={route.id} />}
      {route.name === 'not-found' && <NotFound />}
      <Toaster />
    </>
  );
}
