import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Moon, Plus, Sun } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { useTheme } from '../lib/theme.jsx';
import { Button, IconButton, Tooltip } from '../ui/primitives.jsx';
import { ApolloMark, Wordmark } from '../ui/brand.jsx';
import NewDesignDialog from './NewDesignDialog.jsx';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/templates', label: 'Templates' },
  { to: '/assets', label: 'Assets' },
];

/**
 * Navigation for the workspace pages. Three destinations, nothing else.
 *
 * `overlay` is for the homepage, where the header sits on the rendered sky
 * rather than above it: no bar, no rule, and type in the sky's own ink until
 * the sky has been scrolled off. The handover is invisible because the sky
 * fades to exactly the page background at its foot, so the bar arrives while
 * there is nothing left behind it to cut.
 */
export default function AppHeader({ overlay = false }) {
  const { theme, toggle } = useTheme();
  const [newDesign, setNewDesign] = useState(false);
  const [onSky, setOnSky] = useState(overlay);

  useEffect(() => {
    if (!overlay) return undefined;
    // Measured against the viewport rather than the hero, because by the time
    // the sky is this far up it has already faded into the page.
    const onScroll = () => setOnSky(window.scrollY < Math.max(240, window.innerHeight * 0.6));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  return (
    <>
      <header
        className={cx(
          'sticky top-0 z-40 transition-colors duration-300 ease-out',
          onSky ? 'border-b border-transparent' : 'border-b border-line bg-void'
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-3 px-4 sm:gap-6 sm:px-8">
          {/* A phone cannot hold the lockup, three destinations, the theme
              switch and a button at once. The monogram alone carries the brand
              at that width — and the hero says Apollo in the headline anyway. */}
          <Link
            to="/"
            className={cx('rounded', onSky && 'text-[var(--sky-ink)]')}
            aria-label="Apollo home"
          >
            <span className="sm:hidden">
              <ApolloMark size={22} />
            </span>
            <span className="hidden sm:block">
              <Wordmark className={onSky ? '!text-[var(--sky-ink)]' : undefined} />
            </span>
          </Link>

          <nav className="flex items-center gap-0.5 sm:gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-14 items-center px-1.5 text-[13px] transition-colors duration-150 sm:px-2.5',
                    onSky
                      ? isActive
                        ? 'text-[var(--sky-ink)]'
                        : 'text-[var(--sky-ink-2)] hover:text-[var(--sky-ink)]'
                      : isActive
                        ? 'text-ink'
                        : 'text-ink-3 hover:text-ink-2'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && <span className="absolute inset-x-1.5 -bottom-px h-px bg-accent sm:inset-x-2" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'} side="bottom">
            <IconButton
              onClick={toggle}
              aria-label="Toggle theme"
              size="lg"
              className={
                onSky
                  ? '!text-[var(--sky-ink-2)] hover:!bg-[var(--sky-wash)] hover:!text-[var(--sky-ink)]'
                  : undefined
              }
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
          </Tooltip>

          {/* On the sky this is an outline, not a filled button: the hero's
              Generate is the page's one primary action and two solid buttons
              would argue about which. */}
          <Button
            variant={onSky ? 'ghost' : 'primary'}
            onClick={() => setNewDesign(true)}
            aria-label="New design"
            className={cx(
              '!px-2 sm:!px-3',
              onSky && 'border border-[var(--sky-line)] !text-[var(--sky-ink)] hover:!bg-[var(--sky-wash)]'
            )}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">New design</span>
          </Button>
        </div>
      </header>

      <NewDesignDialog open={newDesign} onClose={() => setNewDesign(false)} />
    </>
  );
}
