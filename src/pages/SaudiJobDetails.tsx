import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Building2, CalendarDays, Copy, MapPin, Share2, Wallet, ExternalLink, Globe } from "lucide-react";
import { toast } from "sonner";
import { StaticPageShell } from "@/components/site/StaticPageShell";
import { formatPostedAt, getJob, getSavedJobs, jobTypeLabel, toggleSavedJob, workplaceLabel } from "@/lib/jobs";

export default function SaudiJobDetails() {
  const { id = "" } = useParams();
  const job = getJob(decodeURIComponent(id));
  const [saved, setSaved] = useState<string[]>(() => getSavedJobs());

  if (!job) {
    return (
      <StaticPageShell
        title="الوظيفة غير متاحة — وظائف السعودية"
        description="لم يتم العثور على تفاصيل هذه الوظيفة."
        path={`/saudi-jobs/${id}`}
        heading="الوظيفة غير متاحة"
        intro="افتح الوظيفة من قائمة النتائج لعرض تفاصيلها."
      >
        <Link to="/saudi-jobs" className="inline-block rounded-xl bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold">
          العودة لقائمة الوظائف
        </Link>
      </StaticPageShell>
    );
  }

  const isSaved = saved.includes(job.id);
  const share = async () => {
    const url = `${window.location.origin}/saudi-jobs/${encodeURIComponent(job.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: job.title, text: job.company, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("تم نسخ رابط الوظيفة");
      }
    } catch {
      /* cancelled */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/saudi-jobs/${encodeURIComponent(job.id)}`);
      toast.success("تم نسخ رابط الوظيفة");
    } catch {
      toast.error("تعذر نسخ الرابط");
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.publishedAt,
    employmentType: job.employmentType === "part" ? "PART_TIME" : job.employmentType === "training" ? "INTERN" : "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: job.company },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.city, addressCountry: "SA" },
    },
  };

  return (
    <StaticPageShell
      title={`${job.title} — ${job.company} | وظائف السعودية`}
      description={(job.description || job.title).slice(0, 155)}
      path={`/saudi-jobs/${encodeURIComponent(job.id)}`}
      heading={job.title}
      intro={`${job.company} — ${job.city}`}
      jsonLd={jsonLd}
    >
      <section className="glass rounded-2xl p-4 border border-border/40">
        <ul className="grid grid-cols-2 gap-3 text-xs text-foreground/75">
          <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" />{job.company}</li>
          <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" />{job.city}</li>
          <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-accent" />{formatPostedAt(job.publishedAt)}</li>
          <li className="flex items-center gap-2"><Wallet className="h-4 w-4 text-accent" />{job.salary || "الراتب غير محدد"}</li>
          <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-accent" />{workplaceLabel(job.workplaceType)}</li>
          <li className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-accent" />{jobTypeLabel(job.employmentType)}</li>
        </ul>
      </section>

      <section className="mt-4 glass rounded-2xl p-4 border border-border/40">
        <h2 className="font-display text-sm font-bold mb-2">وصف الوظيفة</h2>
        <p className="text-sm leading-7 text-foreground/80">{job.description || "لا يوجد وصف مفصل. اطّلع على التفاصيل الكاملة في الإعلان الرسمي."}</p>
      </section>

      <section id="apply" className="mt-4 flex flex-wrap gap-2">
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 flex-1 min-w-[140px] rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition inline-flex items-center justify-center gap-1.5"
        >
          التقديم عبر الإعلان الرسمي <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={() => setSaved(toggleSavedJob(job.id))}
          className="h-11 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm font-medium flex items-center gap-1.5 transition"
        >
          {isSaved ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <Bookmark className="h-4 w-4" />}
          {isSaved ? "محفوظة" : "حفظ"}
        </button>
        <button
          onClick={share}
          className="h-11 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm font-medium flex items-center gap-1.5 transition"
        >
          <Share2 className="h-4 w-4" /> مشاركة
        </button>
        <button
          onClick={copyLink}
          className="h-11 px-4 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-sm font-medium flex items-center gap-1.5 transition"
        >
          <Copy className="h-4 w-4" /> نسخ الرابط
        </button>
      </section>

      <div className="mt-4">
        <Link to="/saudi-jobs" className="text-xs text-accent hover:underline">
          ← كل وظائف السعودية
        </Link>
      </div>
    </StaticPageShell>
  );
}
