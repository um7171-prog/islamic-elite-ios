import { Bookmark, BookmarkCheck, Building2, CalendarDays, Copy, MapPin, Share2, Wallet, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Job, formatPostedAt, jobTypeLabel, workplaceLabel } from "@/lib/jobs";
import { toast } from "sonner";

interface Props {
  job: Job;
  saved: boolean;
  onToggleSave: (id: string) => void;
}

export function JobCard({ job, saved, onToggleSave }: Props) {
  const share = async () => {
    const url = `${window.location.origin}/saudi-jobs/${encodeURIComponent(job.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: job.title, text: `${job.title} — ${job.company}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("تم نسخ رابط الوظيفة");
      }
    } catch {
      /* user cancelled */
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/saudi-jobs/${encodeURIComponent(job.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط الوظيفة");
    } catch {
      toast.error("تعذر نسخ الرابط");
    }
  };

  return (
    <article className="glass rounded-2xl p-4 border border-border/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground leading-snug">{job.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground/70">
            <Building2 className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="truncate">{job.company}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[11px] font-medium">
          {jobTypeLabel(job.employmentType)}
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-foreground/70">
        <li className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-accent" /> {job.city} · {workplaceLabel(job.workplaceType)}
        </li>
        <li className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-accent" /> {formatPostedAt(job.publishedAt)}
        </li>
        {job.salary && (
          <li className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-accent" /> {job.salary}
          </li>
        )}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to={`/saudi-jobs/${encodeURIComponent(job.id)}`}
          className="rounded-xl px-3 py-2 text-xs font-medium bg-foreground/5 hover:bg-foreground/10 transition"
        >
          التفاصيل
        </Link>
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl px-3 py-2 text-xs font-semibold bg-accent text-accent-foreground hover:opacity-90 transition inline-flex items-center gap-1.5"
        >
          التقديم <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={() => onToggleSave(job.id)}
          aria-label={saved ? "إزالة من المحفوظات" : "حفظ الوظيفة"}
          className="h-9 w-9 grid place-items-center rounded-xl bg-foreground/5 hover:bg-foreground/10 transition"
        >
          {saved ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <Bookmark className="h-4 w-4 text-foreground/70" />}
        </button>
        <button
          onClick={share}
          aria-label="مشاركة الوظيفة"
          className="h-9 w-9 grid place-items-center rounded-xl bg-foreground/5 hover:bg-foreground/10 transition"
        >
          <Share2 className="h-4 w-4 text-foreground/70" />
        </button>
        <button
          onClick={copyLink}
          aria-label="نسخ رابط الوظيفة"
          className="h-9 w-9 grid place-items-center rounded-xl bg-foreground/5 hover:bg-foreground/10 transition"
        >
          <Copy className="h-4 w-4 text-foreground/70" />
        </button>
      </div>
    </article>
  );
}
