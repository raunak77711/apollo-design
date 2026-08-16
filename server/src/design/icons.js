import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Home, Search, Heart, User, Settings, ShoppingCart, MapPin, Calendar, Mail,
  Phone, ArrowRight, Check, X, Menu, Instagram, Facebook, Star, Dumbbell,
  Briefcase, Building, Camera, Image, Upload, Download, Play, Flame, Zap,
  Trophy, Clock, Award, Music, Car, Coffee, Leaf, Users, Gift, Sparkles, Globe,
  Wallet, GraduationCap, Stethoscope, Palette, Rocket, ThumbsUp, TrendingUp,
} from 'lucide-react';
import {
  GiPartyPopper, GiBalloonDog, GiAirBalloon, GiCupcake, GiDonut, GiWineGlass,
  GiCat, GiSittingDog, GiOwl, GiFox, GiPanda, GiRabbit, GiElephant, GiLion,
  GiDolphin, GiTurtle, GiBee, GiUnicorn, GiGhost, GiCrown, GiPresent, GiGuitar,
  GiMusicalNotes, GiSunglasses, GiRainbowStar, GiSparkles, GiSnowflake1,
  GiCastle, GiIsland, GiRocket, GiHearts, GiFlowers, GiPawPrint, GiTrophy,
  GiCoffeeCup, GiPizzaSlice, GiHamburger, GiSoccerBall, GiBasketballBall,
  GiIceCreamCone, GiDiamondRing, GiCampfire, GiTreehouse, GiPineTree, GiMoon,
  GiSun, GiRose, GiMapleLeaf, GiButterfly,
} from 'react-icons/gi';

/**
 * MIRROR of client/src/design/icons.js's LUCIDE and GAME maps, kept in sync
 * for one reason: exportService's SVG renderer needs the exact same glyph the
 * browser shows, or a merged/flattened/exported icon layer looks nothing like
 * what was on the canvas. Rendered once via react-dom/server (no browser, no
 * DOM) rather than approximated as a placeholder shape.
 */

const LUCIDE = {
  Home, Search, Heart, User, Settings, ShoppingCart, MapPin, Calendar, Mail,
  Phone, ArrowRight, Check, X, Menu, Instagram, Facebook, Star, Dumbbell,
  Briefcase, Building, Camera, Image, Upload, Download, Play, Flame, Zap,
  Trophy, Clock, Award, Music, Car, Coffee, Leaf, Users, Gift, Sparkles, Globe,
  Wallet, GraduationCap, Stethoscope, Palette, Rocket, ThumbsUp, TrendingUp,
};

const GAME = {
  GiPartyPopper, GiBalloonDog, GiAirBalloon, GiCupcake, GiDonut, GiWineGlass,
  GiCat, GiSittingDog, GiOwl, GiFox, GiPanda, GiRabbit, GiElephant, GiLion,
  GiDolphin, GiTurtle, GiBee, GiUnicorn, GiGhost, GiCrown, GiPresent, GiGuitar,
  GiMusicalNotes, GiSunglasses, GiRainbowStar, GiSparkles, GiSnowflake1,
  GiCastle, GiIsland, GiRocket, GiHearts, GiFlowers, GiPawPrint, GiTrophy,
  GiCoffeeCup, GiPizzaSlice, GiHamburger, GiSoccerBall, GiBasketballBall,
  GiIceCreamCone, GiDiamondRing, GiCampfire, GiTreehouse, GiPineTree, GiMoon,
  GiSun, GiRose, GiMapleLeaf, GiButterfly,
};

const LIBRARIES = { lucide: LUCIDE, game: GAME };

function resolve(name, library) {
  const map = LIBRARIES[library] || LUCIDE;
  return map[name] || map.Star || LUCIDE.Star;
}

/**
 * Render one icon to an SVG fragment (an inner `<svg>` element as a string,
 * already sized and coloured) or null if the component can't be resolved.
 * Lucide icons take `color`/`strokeWidth`/`size` props directly; react-icons
 * (the "game" library) size via `size` and colour via `color` too, but some
 * of Game Icons' source paths assume a black fill — wrapping in a `<g fill>`
 * makes colour apply even where the icon's own paths don't set it.
 */
export function renderIconSvg(name, library, { size = 24, color = '#000000', strokeWidth = 2 } = {}) {
  const Icon = resolve(name, library);
  if (!Icon) return null;
  try {
    const props = library === 'game' ? { size, color } : { size, color, strokeWidth };
    const markup = renderToStaticMarkup(createElement(Icon, props));
    return markup || null;
  } catch {
    return null;
  }
}
