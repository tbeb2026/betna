import { InspectionForm } from "../../../../../features/verification/inspection-form";
import { getSession } from "../../../../../lib/auth";

export default async function VerifierInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  return <InspectionForm inspectionId={id} authToken={session?.token} />;
}
