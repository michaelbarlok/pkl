interface FormErrorProps {
  message: string | null | undefined;
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-400">
      {message}
    </div>
  );
}
