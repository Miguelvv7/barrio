import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { ScreensGallery } from "./ScreensGallery";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/try/[slug]/screens">) {
  const business = await getStore().getBusinessBySlug((await params).slug);
  return { title: business ? `${business.name} on Echo Show` : "Not found" };
}

export default async function ScreensPage({ params }: PageProps<"/try/[slug]/screens">) {
  const { slug } = await params;
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) notFound();
  return <ScreensGallery slug={business.slug} name={business.name} kind={business.kind} />;
}
