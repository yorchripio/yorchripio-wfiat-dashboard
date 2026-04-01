// components/ui/ChainLogo.tsx
// Logos SVG de las blockchains

interface ChainLogoProps {
  chain: "ethereum" | "worldchain" | "base" | "gnosis";
  className?: string;
  size?: number;
}

export function ChainLogo({ chain, className = "", size = 24 }: ChainLogoProps) {
  const logos = {
    ethereum: (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <path
          d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24Z"
          fill="#627EEA"
        />
        <path
          d="M12.498 3V9.652L17.996 12.165L12.498 3Z"
          fill="white"
          fillOpacity="0.6"
        />
        <path
          d="M12.498 3L7 12.165L12.498 9.652V3Z"
          fill="white"
        />
        <path
          d="M12.498 16.476V20.996L18 12.808L12.498 16.476Z"
          fill="white"
          fillOpacity="0.6"
        />
        <path
          d="M12.498 20.996V16.476L7 12.808L12.498 20.996Z"
          fill="white"
        />
        <path
          d="M12.498 15.43L17.996 12.165L12.498 9.654V15.43Z"
          fill="white"
          fillOpacity="0.2"
        />
        <path
          d="M7 12.165L12.498 15.43V9.654L7 12.165Z"
          fill="white"
          fillOpacity="0.6"
        />
      </svg>
    ),
    worldchain: (
      <svg
        width={size}
        height={size}
        viewBox="200 200 624 624"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <path
          d="M649.72,274.04c-42.27-24.41-88.03-37.04-137.72-37.04s-95.44,12.2-137.72,37.04-75.4,57.96-100.24,100.24c-24.84,42.27-37.04,88.03-37.04,137.72s12.2,95.44,37.04,137.72c24.84,42.27,57.96,75.4,100.24,100.24s88.03,37.04,137.72,37.04,95.44-12.2,137.72-37.04,75.4-57.96,100.24-100.24c24.84-42.27,37.04-88.03,37.04-137.72s-12.2-95.44-37.04-137.72-57.96-75.4-100.24-100.24h0ZM529,611.37c-30.94,0-55.78-8.72-74.96-26.58-13.07-12.2-21.35-27.02-25.71-44.45h296.36c-3.05,25.28-10.46,48.81-21.79,71.04h-174.33.44ZM428.76,484.54c3.92-17,12.64-31.81,25.28-44.02,18.74-17.87,44.02-27.02,74.96-27.02h175.2c11.33,22.23,18.3,45.76,20.92,71.04h-296.36ZM326.34,402.61c19.18-33.12,44.89-59.27,77.58-78.88,32.69-19.61,68.86-29.2,108.08-29.2s75.4,9.59,108.08,29.2c16.56,10.02,31.81,21.79,44.89,35.3h-138.59c-31.38,0-59.27,6.54-83.68,19.61-24.41,13.07-43.58,30.94-57.09,54.04-9.59,16.13-15.69,33.56-18.3,52.3h-67.99c3.49-29.2,12.2-56.66,27.02-81.93v-.44ZM620.08,700.27c-32.69,19.61-68.86,29.2-108.08,29.2s-75.4-9.59-108.08-29.2c-32.69-19.61-58.84-45.76-77.58-78.88-14.38-24.84-23.53-51.86-27.02-80.63h67.99c2.61,18.74,8.72,36.17,18.3,52.3,13.51,22.66,32.69,40.97,57.09,54.04,24.41,13.07,52.3,19.61,83.68,19.61h137.28c-13.07,13.07-27.46,24.41-43.58,33.99v-.44Z"
          fill="#010103"
        />
      </svg>
    ),
    base: (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <rect width="24" height="24" rx="12" fill="#0052FF" />
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          fill="white"
        />
        <path
          d="M2 17L12 22L22 17L12 12L2 17Z"
          fill="white"
          fillOpacity="0.8"
        />
        <path
          d="M2 12L12 17L22 12L12 7L2 12Z"
          fill="white"
          fillOpacity="0.6"
        />
      </svg>
    ),
    gnosis: (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <circle cx="12" cy="12" r="12" fill="#04795B" />
        <path
          d="M7.5 10.5C7.5 8.01 9.51 6 12 6s4.5 2.01 4.5 4.5h-2.25c0-1.24-1.01-2.25-2.25-2.25S9.75 9.26 9.75 10.5H7.5Z"
          fill="white"
        />
        <path
          d="M16.5 13.5c0 2.49-2.01 4.5-4.5 4.5s-4.5-2.01-4.5-4.5h2.25c0 1.24 1.01 2.25 2.25 2.25s2.25-1.01 2.25-2.25H16.5Z"
          fill="white"
        />
        <rect x="7.5" y="11.25" width="9" height="1.5" fill="white" />
      </svg>
    ),
  };

  return logos[chain] || null;
}
