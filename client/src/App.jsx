import { useLocation } from './lib/router.js';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';

export default function App() {
  const { path, search } = useLocation();
  const match = path.match(/^\/r\/([A-Za-z0-9]{3,8})\/?$/);
  if (match) {
    const code = match[1].toUpperCase();
    const watch = new URLSearchParams(search).has('watch');
    return <Room key={code} code={code} asSpectator={watch} />;
  }
  return <Lobby />;
}
