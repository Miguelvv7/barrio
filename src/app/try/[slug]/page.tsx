import { notFound } from "next/navigation";
import { issuePageToken } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { VoiceConsole } from "./VoiceConsole";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/try/[slug]">) {
  const business = await getStore().getBusinessBySlug((await params).slug);
  return { title: business ? `Talk to ${business.name}` : "Not found" };
}

export default async function TryPage({ params }: PageProps<"/try/[slug]">) {
  const { slug } = await params;
  const store = getStore();
  const [business, all] = await Promise.all([store.getBusinessBySlug(slug), store.listBusinesses()]);
  if (!business) notFound();
  return (
    <VoiceConsole
      business={{ slug: business.slug, name: business.name, kind: business.kind, description: business.description }}
      others={all.filter((b) => b.slug !== slug).slice(0, 6).map((b) => ({ slug: b.slug, name: b.name }))}
      configured={Boolean(process.env.ANTHROPIC_API_KEY)}
      demoNotice={process.env.BARRIO_DEMO_NOTICE !== "off"}
      token={issuePageToken(business.slug)}
    />
  );
}
