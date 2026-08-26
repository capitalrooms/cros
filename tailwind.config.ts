import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        neutral: {
          50: '#FAFAF9',
          100: '#F5F5F4',
          200: '#E7E5E4',
          300: '#D6D3D1',
          400: '#A8A29E',
          500: '#78716F',
          600: '#57534E',
          700: '#44403C',
          800: '#292524',
          900: '#1C1917',
          950: '#0F0F0E',
        },
        accent: '#0066FF',
      },
      spacing: {
        '0': '0',
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '32px',
        '3xl': '48px',
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.5' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg': ['18px', { lineHeight: '1.6' }],
        'xl': ['20px', { lineHeight: '1.6' }],
        '2xl': ['24px', { lineHeight: '1.4' }],
        '3xl': ['30px', { lineHeight: '1.3' }],
      },
      borderRadius: {
        'none': '0',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'full': '9999px',
      },
    },
  },
  plugins: [],
}
export default config
