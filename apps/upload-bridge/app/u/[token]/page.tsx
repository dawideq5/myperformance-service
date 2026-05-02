import { UploadClient } from "@/components/UploadClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function UploadTokenPage({ params }: PageProps) {
  const { token } = await params;
  return <UploadClient token={token} />;
}
