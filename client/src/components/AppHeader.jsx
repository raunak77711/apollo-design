import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Moon, Plus, Sun } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { useTheme } from '../lib/theme.jsx';
import { Button, IconButton, Tooltip } from '../ui/primitives.jsx';
import { Wordmark } from '../ui/brand.jsx';
import NewDesignDialog from './NewDesignDialog.jsx';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/templates', label: 'Templates' },
  { to: '/assets', label: 'Assets' },
];

/** Navigation for the workspace pages. Three destinations, nothing else. */
export default function AppHeader() {
  const { theme, toggle } = useTheme();
  const [newDesign, setNewDesign] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-void">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-6 px-5 sm:px-8">
          <Link to="/" className="rounded" aria-label="Apollo home">
            <Wordmark />
          </Link>

          <nav className="flex items-center gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-14 items-center px-2.5 text-[13px] transition-colors duration-150',
                    isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && <span className="absolute inset-x-2 -bottom-px h-px bg-accent" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'} side="bottom">
            <IconButton onClick={toggle} aria-label="Toggle theme" size="lg">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
          </Tooltip>

          <Button variant="primary" onClick={() => setNewDesign(true)}>
            <Plus size={14} />
            New design
          </Button>
        </div>
      </header>

      <NewDesignDialog open={newDesign} onClose={() => setNewDesign(false)} />
    </>
  );
}
