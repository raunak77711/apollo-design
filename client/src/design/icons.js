/**
 * Multi-library icon registry. An icon element is never arbitrary SVG — only a
 * `{ library, name }` pair resolved through the closed maps below, matching the
 * whitelists in design/schema.js (ALLOWED_ICONS). Lucide is the default "Line"
 * set the AI uses; the others are hand-curated "fun" sets for manual browsing.
 */
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

export const ICON_LIBRARIES = [
  { id: 'lucide', label: 'Line', map: LUCIDE },
  { id: 'game', label: 'Fun', map: GAME },
];

const libraryMap = (library) => ICON_LIBRARIES.find((l) => l.id === library)?.map || LUCIDE;

export function getIcon(name, library = 'lucide') {
  const map = libraryMap(library);
  return map[name] || map.Star || LUCIDE.Star;
}

export function iconNames(library = 'lucide') {
  return Object.keys(libraryMap(library));
}

// Backward-compatible flat exports for call sites that only know Lucide.
export const ICON_MAP = LUCIDE;
export const ICON_NAMES = Object.keys(LUCIDE);
