interface FloatingParticlesProps {
  count?: number;
  className?: string;
  particleClassName?: string;
  sizeMin?: number;
  sizeRange?: number;
  durationMin?: number;
  durationRange?: number;
  delayMax?: number;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

export default function FloatingParticles({
  count = 12,
  className = 'absolute inset-0 pointer-events-none overflow-hidden',
  particleClassName = 'bg-sand/10',
  sizeMin = 2,
  sizeRange = 3,
  durationMin = 10,
  durationRange = 15,
  delayMax = 10,
}: FloatingParticlesProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => {
        const seed = index + 1;
        const size = sizeMin + seededUnit(seed * 1.1) * sizeRange;
        const left = seededUnit(seed * 2.3) * 100;
        const top = seededUnit(seed * 3.7) * 100;
        const duration = durationMin + seededUnit(seed * 4.9) * durationRange;
        const delay = seededUnit(seed * 5.7) * delayMax;

        return (
          <div
            key={index}
            className={`absolute rounded-full ${particleClassName}`}
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              top: `${top}%`,
              animation: `float-particle ${duration}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}
