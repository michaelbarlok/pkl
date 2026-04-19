interface FormErrorProps {
  message: string | null | undefined;
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <div role="alert" className="alert-danger px-4 py-3 text-sm">
      {message}
    </div>
  );
}
