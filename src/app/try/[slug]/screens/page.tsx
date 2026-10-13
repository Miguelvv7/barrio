import { notFound } from "next/navigation";
import { liveScreens } from "@/lib/screens";
import { getStore } from "@/lib/store";
import { ScreensGallery } from "./ScreensGallery";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/try/[slug]/screens">) {
  const business = await getStore().getBusinessBySlug((await params).slug);
  return { title: business ? `${business.name} on Echo Show` : "Not found" };
}

export default async function ScreensPage({ params }: PageProps<"/try/[slug]/screens">) {
  const { slug } = await params;
  const store = getStore();
  const business = await store.getBusinessBySlug(slug);
  if (!business) notFound();
  const { html, shots } = await liveScreens(business, store);
  return <ScreensGallery slug={business.slug} name={business.name} html={html} shots={shots} />;
}
