/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cmip: {
          50: '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#064e3b',
          950: '#022c22',
          red: '#b91c1c',
          'red-hover': '#991b1b',
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'Plus Jakarta Sans', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite',
        'flash-call': 'flashCall 1.2s ease-in-out infinite alternate',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 25px rgba(34, 197, 94, 0.4)' },
          '50%': { boxShadow: '0 0 60px rgba(34, 197, 94, 0.8)' },
        },
        flashCall: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.03)', opacity: '0.9' },
        }
      }
    },
  },
  plugins: [],
}
