export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/pkl-logo.png" alt="PKL" className="mx-auto h-28 w-auto" />
        </div>
        {children}
      </div>
    </div>
  );
}
