export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/pickletrack-logo.svg" alt="PickleTrack" className="mx-auto h-28 w-auto" />
          <p className="mt-2 text-sm text-dark-300">Ladder League Platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
