// Logo Ripio (stroke #010103 para coincidir con marca)
export function RipioLogo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle
        cx="24"
        cy="24"
        r="21.5"
        fill="none"
        stroke="#010103"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30.6934,27.8481,17.4676,33.9414a.6307.6307,0,0,1-.8946-.5728V21.2976a1.2616,1.2616,0,0,1,.7336-1.1457l13.2258-6.0933a.6307.6307,0,0,1,.8946.5728v12.071A1.2616,1.2616,0,0,1,30.6934,27.8481Z"
        fill="none"
        stroke="#010103"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
