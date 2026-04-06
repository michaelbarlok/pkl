export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/TriStarPB-dark-Photoroom.png"
        alt="Tri-Star Pickleball"
        className={`logo-dark ${className ?? ""}`}
      />
      <img
        src="/TriStarPB-light-Photoroom.png"
        alt="Tri-Star Pickleball"
        className={`logo-light ${className ?? ""}`}
      />
    </>
  );
}
