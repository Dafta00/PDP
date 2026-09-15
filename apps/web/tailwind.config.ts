import type { Config } from 'tailwindcss';

// Design tokens sourced from the UI UX Pro Max skill's "Government Portal /
// Civic Services" color structure and the "Corporate Trust" typography
// pairing (Lexend + Source Sans 3), with the primary hue re-anchored to the
// PDP party green so the product's brand identity matches the supplied logo
// while keeping enterprise-grade contrast and restraint (see brand `party`
// red below — reserved for identity touches, never status/interactive UI).
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Primary PDP green scale, anchored at brand-600 = #0F7A47 (~5.4:1 with white).
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#0EA968',
          600: '#0F7A47',
          700: '#0B5C36',
          800: '#073D26',
          900: '#052A1A',
        },
        // PDP flag red — reserved for brand-identity accents (logo lockups,
        // the login welcome panel). Never used for status/danger UI, which
        // stays on the neutral Tailwind red scale to avoid ambiguity.
        party: {
          red: '#CE1126',
        },
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          600: '#D97706',
          700: '#B45309',
        },
        info: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          600: '#0369A1',
          700: '#075985',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};

export default config;
