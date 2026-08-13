/**
 * Controlled Lucide icon registry. The AI may only reference names in
 * ALLOWED_ICONS (schema.js); here we map each allowed name to its React
 * component. Arbitrary AI-generated SVG is never allowed.
 */
import {
  Home, Search, Heart, User, Settings, ShoppingCart, MapPin, Calendar, Mail,
  Phone, ArrowRight, Check, X, Menu, Instagram, Facebook, Star, Dumbbell,
  Briefcase, Building, Camera, Image, Upload, Download, Play, Flame, Zap,
  Trophy, Clock, Award,
} from 'lucide-react';

export const ICON_MAP = {
  Home, Search, Heart, User, Settings, ShoppingCart, MapPin, Calendar, Mail,
  Phone, ArrowRight, Check, X, Menu, Instagram, Facebook, Star, Dumbbell,
  Briefcase, Building, Camera, Image, Upload, Download, Play, Flame, Zap,
  Trophy, Clock, Award,
};

export function getIcon(name) {
  return ICON_MAP[name] || Star;
}

export const ICON_NAMES = Object.keys(ICON_MAP);
