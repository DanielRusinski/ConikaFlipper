/**
 * IconService.js
 * Central Icon Service providing unified icons exclusively from the 2048x2048 icon atlas.
 * Replaces raw emoji and Unicode strings with deterministic, scalable atlas sprite elements.
 */

export const ICON_ATLAS_PATH = 'src/assets/icon-atlas.png';

/**
 * Canonical dictionary mapping character glyphs and icon IDs to atlas icon names.
 */
export const ICON_NAME_MAP = {
  // Direct names
  'coin_yellow': 'coin_yellow',
  'coin_red': 'coin_red',
  'timer': 'timer',
  'heart': 'heart',
  'lightning': 'lightning',
  'bomb': 'bomb',
  'pause': 'pause',
  'trophy': 'trophy',
  'target': 'target',
  'shop_bag': 'shop_bag',
  'crystal': 'crystal',
  'close': 'close',
  'cart': 'cart',
  'money_bag': 'money_bag',
  'package': 'package',
  'warning': 'warning',
  'ring': 'ring',
  'potion': 'potion',
  'swords': 'swords',
  'shield': 'shield',
  'crystal_orb': 'crystal_orb',
  'magnet': 'magnet',
  'hourglass': 'hourglass',
  'clover': 'clover',
  'heart_sparkle': 'heart_sparkle',
  'dagger': 'dagger',
  'hammer': 'hammer',
  'dragon': 'dragon',
  'diamond_dot': 'diamond_dot',
  'sparkles': 'sparkles',
  'diamond_orange': 'diamond_orange',
  'diamond_red': 'diamond_red',
  'heart_green': 'heart_green',
  'ball_white': 'ball_white',
  'ball_yellow': 'ball_yellow',
  'ball_wood': 'ball_wood',
  'ball_purple': 'ball_purple',
  'tennis_ball': 'tennis_ball',
  'joystick': 'joystick',
  'lock': 'lock',
  'star': 'star',
  'wind': 'wind',
  'card': 'card',
  'palette': 'palette',
  'gamepad': 'gamepad',
  'phone': 'phone',
  'rotate': 'rotate',
  'arrow_forward': 'arrow_forward',
  'zoom_in': 'zoom_in',
  'zoom_out': 'zoom_out',
  'reset_view': 'reset_view',
  'undo': 'undo',
  'redo': 'redo',
  'diff': 'diff',
  'camera': 'camera',
  'export_box': 'export_box',
  'import_box': 'import_box',
  'save_disk': 'save_disk',
  'check_mark': 'check_mark',
  'balance_scale': 'balance_scale',
  'chart_bar': 'chart_bar',
  'chart_up': 'chart_up',
  'bug': 'bug',
  'app_icon': 'app_icon',

  // Raw Unicode & Emoji Glyphs
  '🪙': 'coin_yellow',
  '🔴': 'coin_red',
  '⏱️': 'timer',
  '⏱': 'timer',
  '❤️': 'heart',
  '❤': 'heart',
  '⚡': 'lightning',
  '💣': 'bomb',
  '⏸️': 'pause',
  '⏸': 'pause',
  '🏆': 'trophy',
  '🎯': 'target',
  '🛍️': 'shop_bag',
  '🛍': 'shop_bag',
  '💎': 'crystal',
  '✕': 'close',
  '🛒': 'cart',
  '💰': 'money_bag',
  '📦': 'package',
  '⚠️': 'warning',
  '⚠': 'warning',
  '💍': 'ring',
  '🧪': 'potion',
  '⚔️': 'swords',
  '⚔': 'swords',
  '🛡️': 'shield',
  '🛡': 'shield',
  '🔮': 'crystal_orb',
  '🧲': 'magnet',
  '⏳': 'hourglass',
  '🍀': 'clover',
  '💖': 'heart_sparkle',
  '🗡️': 'dagger',
  '🗡': 'dagger',
  '🔨': 'hammer',
  '🐉': 'dragon',
  '💠': 'diamond_dot',
  '✨': 'sparkles',
  '🔶': 'diamond_orange',
  '♦️': 'diamond_red',
  '♦': 'diamond_red',
  '💚': 'heart_green',
  '⚪': 'ball_white',
  '🟡': 'ball_yellow',
  '🪵': 'ball_wood',
  '🟣': 'ball_purple',
  '🎾': 'tennis_ball',
  '🕹️': 'joystick',
  '🕹': 'joystick',
  '🔒': 'lock',
  '⭐': 'star',
  '💨': 'wind',
  '🃏': 'card',
  '🎨': 'palette',
  '🎮': 'gamepad',
  '📱': 'phone',
  '↺': 'rotate',
  '⟲': 'reset_view',
  '➔': 'arrow_forward',
  '→': 'arrow_forward',
  '✓': 'check_mark',
  '⚖️': 'balance_scale',
  '⚖': 'balance_scale',
  '📊': 'chart_bar',
  '📈': 'chart_up',
  '🐛': 'bug',
  '📸': 'camera',
  '📤': 'export_box',
  '📥': 'import_box',
  '💾': 'save_disk',
  '🔍': 'diff',
  '↩️': 'undo',
  '↩': 'undo',
  '↪️': 'redo',
  '↪': 'redo'
};

/**
 * Returns canonical atlas icon name for any glyph or key.
 * @param {string} keyOrGlyph
 * @returns {string}
 */
export function getIconName(keyOrGlyph) {
  if (!keyOrGlyph) return 'package';
  const clean = String(keyOrGlyph).trim();
  return ICON_NAME_MAP[clean] || ICON_NAME_MAP[clean.replace(/\ufe0f/g, '')] || 'package';
}

/**
 * Returns HTML string rendering an atlas sprite element.
 * @param {string} keyOrGlyph - Name or glyph (e.g. 'coin_yellow' or '🪙')
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string} [options.style]
 * @param {string} [options.size] - e.g. '1.2em' or '24px'
 * @returns {string}
 */
export function renderIconHTML(keyOrGlyph, options = {}) {
  const iconName = getIconName(keyOrGlyph);
  const extraClass = options.className ? ` ${options.className}` : '';
  const sizeStyle = options.size ? `width:${options.size};height:${options.size};` : '';
  const extraStyle = options.style ? `${options.style};` : '';
  const styleAttr = (sizeStyle || extraStyle) ? ` style="${sizeStyle}${extraStyle}"` : '';
  return `<span class="atlas-icon icon-${iconName}${extraClass}"${styleAttr} aria-hidden="true"></span>`;
}

/**
 * Creates and returns a DOM span element rendering the atlas icon.
 * @param {string} keyOrGlyph
 * @param {object} [options]
 * @returns {HTMLElement}
 */
export function createIconElement(keyOrGlyph, options = {}) {
  const span = document.createElement('span');
  const iconName = getIconName(keyOrGlyph);
  span.className = `atlas-icon icon-${iconName}${options.className ? ' ' + options.className : ''}`;
  span.setAttribute('aria-hidden', 'true');
  if (options.size) {
    span.style.width = options.size;
    span.style.height = options.size;
  }
  if (options.style) {
    Object.assign(span.style, options.style);
  }
  return span;
}

/**
 * Helper to replace known emoji glyphs in a text string with atlas icon HTML.
 * @param {string} text
 * @returns {string}
 */
export function replaceEmojisWithAtlasIcons(text) {
  if (!text) return text;
  let out = String(text);
  for (const glyph of Object.keys(ICON_NAME_MAP)) {
    if (glyph.length > 0 && /[\uD800-\uDBFF]|[\u2600-\u27BF]|[\u2300-\u23FF]|[\u2B50-\u2B55]|[\u25A0-\u25FF]|[\u2190-\u21FF]|[\u2900-\u297F]/.test(glyph)) {
      if (out.includes(glyph)) {
        const iconName = ICON_NAME_MAP[glyph];
        const iconHtml = `<span class="atlas-icon icon-${iconName}" aria-hidden="true"></span>`;
        out = out.split(glyph).join(iconHtml);
      }
    }
  }
  return out;
}
