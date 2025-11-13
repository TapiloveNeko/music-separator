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
        'rotate-clockwise-blue': {
          '0%': { 
            transform: 'translate(-50%, -50%) translateX(20vw) rotate(180deg) translateX(20vw) rotate(-180deg)',
          },
          '25%': { 
            transform: 'translate(-50%, -50%) translateX(20vw) rotate(270deg) translateX(20vw) rotate(-270deg)',
          },
          '50%': { 
            transform: 'translate(-50%, -50%) translateX(20vw) rotate(360deg) translateX(20vw) rotate(-360deg)',
          },
          '75%': { 
            transform: 'translate(-50%, -50%) translateX(20vw) rotate(450deg) translateX(20vw) rotate(-450deg)',
          },
          '100%': { 
            transform: 'translate(-50%, -50%) translateX(20vw) rotate(540deg) translateX(20vw) rotate(-540deg)',
          },
        },
        'rotate-clockwise-pink': {
          '0%': { 
            transform: 'translate(-50%, -50%) translateX(-20vw) rotate(0deg) translateX(20vw) rotate(0deg)',
          },
          '25%': { 
            transform: 'translate(-50%, -50%) translateX(-20vw) rotate(90deg) translateX(20vw) rotate(-90deg)',
          },
          '50%': { 
            transform: 'translate(-50%, -50%) translateX(-20vw) rotate(180deg) translateX(20vw) rotate(-180deg)',
          },
          '75%': { 
            transform: 'translate(-50%, -50%) translateX(-20vw) rotate(270deg) translateX(20vw) rotate(-270deg)',
          },
          '100%': { 
            transform: 'translate(-50%, -50%) translateX(-20vw) rotate(360deg) translateX(20vw) rotate(-360deg)',
          },
        },
      },
      animation: {
        'rotate-blue': 'rotate-clockwise-blue 5s linear infinite',
        'rotate-pink': 'rotate-clockwise-pink 5s linear infinite',
      },
    },
  },
  plugins: [],
}