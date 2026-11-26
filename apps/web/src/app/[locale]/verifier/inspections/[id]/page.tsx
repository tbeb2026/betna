import { InspectionForm } from "../../../../../features/verification/inspection-form";
import { getVerifierInspection } from "../../../../../features/verification/verification-data";
import { getSession } from "../../../../../lib/auth";

export default async function VerifierInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const inspection = await getVerifierInspection(id);
  return (
    <InspectionForm
      inspectionId={id}
      propertyId={inspection?.propertyId}
      category={inspection?.property?.category}
    />
  );
}
