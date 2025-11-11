/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#16213e',
        secondary: '#8e44ad',
        success: '#2ecc71',
        danger: '#e74c3c',
      },
      fontFamily: {
        sans: ['Noto Sans JP', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['source-code-pro', 'Menlo', 'Monaco', 'Consolas', 'Courier New', 'monospace'],
      },
      keyframes: {
        'puff-puff': {
          '0%, 100%': { 
            transform: 'scale(1)',
            opacity: '0.35'
          },
          '50%': { 
            transform: 'scale(1.2)',
            opacity: '0.65'
          },
        },
      },
      animation: {
        'puff-puff': 'puff-puff 3s ease-in-out infinite',
        'puff-puff-slow': 'puff-puff 3s ease-in-out infinite',
        'puff-puff-slower': 'puff-puff 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

