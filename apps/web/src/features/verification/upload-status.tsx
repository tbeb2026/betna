export function UploadStatus({ status }: { status: string }) {
  return (
    <p className="form-help" role="status" aria-live="polite">
      {status}
    </p>
  );
}
