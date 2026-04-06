export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/TriStarPB-dark.png"
        alt="Tri-Star Pickleball"
        className={`logo-dark ${className ?? ""}`}
      />
      <img
        src="/TriStarPB-light.jpg"
        alt="Tri-Star Pickleball"
        className={`logo-light ${className ?? ""}`}
      />
    </>
  );
}
