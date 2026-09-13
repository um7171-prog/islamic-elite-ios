import { ExternalLink, Landmark, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { StaticPageShell } from "@/components/site/StaticPageShell";

const PORTALS = [
  {
    name: "منصة جدارات",
    url: "https://jadarat.hrsd.gov.sa/",
    note: "المنصة الرسمية للتوظيف في القطاع الحكومي والخاص التابعة للموارد البشرية.",
    Icon: Landmark,
  },
  {
    name: "وزارة الموارد البشرية",
    url: "https://www.hrsd.gov.sa/",
    note: "الأخبار والخدمات الرسمية المتعلقة بالتوظيف والعمل.",
    Icon: ShieldCheck,
  },
  {
    name: "طاقات",
    url: "https://www.taqat.sa/",
    note: "برامج التوظيف والتدريب المدعومة.",
    Icon: Users,
  },
];

export default function GovernmentJobs() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "الوظائف الحكومية في السعودية",
    description: "روابط رسمية للتقديم على الوظائف الحكومية عبر منصة جدارات.",
  };

  return (
    <StaticPageShell
      title="الوظائف الحكومية في السعودية — التقديم عبر جدارات"
      description="تعرّف على طريقة التقديم على الوظائف الحكومية في المملكة عبر منصة جدارات الرسمية وروابط الجهات الحكومية المعتمدة."
      path="/government-jobs"
      heading="الوظائف الحكومية"
      intro="التقديم على الوظائف الحكومية يتم حصرياً عبر المنصات الرسمية."
      jsonLd={jsonLd}
    >
      <section className="glass rounded-2xl p-4 border border-border/40">
        <p className="text-sm leading-7 text-foreground/80">
          لا يتم جمع أو نشر إعلانات الوظائف الحكومية داخل التطبيق. اضغط الزر أدناه للانتقال إلى منصة
          «جدارات» الرسمية وإكمال التقديم هناك مباشرة.
        </p>
        <a
          href="https://jadarat.hrsd.gov.sa/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 h-12 w-full rounded-xl bg-accent text-accent-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 transition"
        >
          فتح منصة جدارات <ExternalLink className="h-4 w-4" />
        </a>
      </section>

      <section className="mt-4 space-y-3">
        <h2 className="font-display text-sm font-bold">روابط رسمية أخرى</h2>
        {PORTALS.map((p) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass rounded-2xl p-4 border border-border/40 flex items-start gap-3 hover:bg-foreground/5 transition"
          >
            <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-accent/15 text-accent">
              <p.Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{p.name}</span>
              <span className="block mt-0.5 text-xs text-foreground/70 leading-relaxed">{p.note}</span>
            </span>
          </a>
        ))}
      </section>

      <div className="mt-6">
        <Link to="/saudi-jobs" className="text-xs text-accent hover:underline">
          ← العودة إلى وظائف السعودية
        </Link>
      </div>
    </StaticPageShell>
  );
}
