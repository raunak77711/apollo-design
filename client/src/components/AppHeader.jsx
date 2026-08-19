import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Moon, Plus, Sun } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { useTheme } from '../lib/theme.jsx';
import { Button, IconButton, Tooltip } from '../ui/primitives.jsx';
import { ApolloMark, Spark, Wordmark } from '../ui/brand.jsx';
import NewDesignDialog from './NewDesignDialog.jsx';

// Apollo AI carries a mark and the others do not. That is the whole signal:
// the four design destinations are places in one workspace, and Apollo AI is a
// second experience next to it — enough to read as different, not enough to
// need a bigger bar.
const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/scribble', label: 'Scribble' },
  { to: '/templates', label: 'Templates' },
  { to: '/assets', label: 'Assets' },
  { to: '/ai', label: 'Apollo AI', mark: true },
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
  const { pathname } = useLocation();
  const navRef = useRef(null);
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

  // On a phone the nav scrolls, so the destination you are actually on can sit
  // past the right edge. Bring it back into view whenever the route changes.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [pathname]);

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

          <nav ref={navRef} className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto sm:gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'relative flex h-14 items-center whitespace-nowrap px-1.5 text-[13px] transition-colors duration-150 sm:px-2.5',
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
                    {link.mark && (
                      <Spark
                        size={10}
                        className={cx(
                          'mr-1.5 transition-colors duration-150',
                          onSky
                            ? isActive
                              ? 'text-[var(--sky-ink)]'
                              : 'text-[var(--sky-ink-3)]'
                            : isActive
                              ? 'text-accent'
                              : 'text-accent/55'
                        )}
                      />
                    )}
                    {link.label}
                    {isActive && <span className="absolute inset-x-1.5 bottom-0 h-px bg-accent sm:inset-x-2" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

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
