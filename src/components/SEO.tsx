import { Helmet } from "react-helmet-async";

const SITE_URL = "https://www.techsnds.com";

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  lang?: "ar" | "en";
  noindex?: boolean;
}

export function SEO({
  title,
  description,
  path = "/",
  image = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a4051968-550a-451c-9ef8-efc7fb2a0864/id-preview-ed2185df--a4d134fd-d6dc-4549-888f-70a30da9e855.lovable.app-1778759623532.png",
  type = "website",
  jsonLd,
  lang = "ar",
  noindex = false,
}: SEOProps) {
  const url = `${SITE_URL}${path}`;
  const jsonLdArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Helmet>
      <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content={lang === "ar" ? "ar_SA" : "en_US"} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {jsonLdArray.map((data, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
    </Helmet>
  );
}
