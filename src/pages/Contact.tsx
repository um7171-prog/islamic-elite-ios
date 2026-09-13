import { useState } from "react";
import { z } from "zod";
import { Mail, MessageCircle, Send, Phone, CheckCircle2, Loader2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { StaticPageShell, InfoCard } from "@/components/site/StaticPageShell";
import { SITE_EMAIL, SITE_PHONE } from "@/components/site/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function Contact() {
  const { t } = useLocale();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const schema = z.object({
    name: z.string().trim().min(2, t("Please enter your name.", "الرجاء إدخال الاسم.")).max(100),
    email: z.string().trim().email(t("Invalid email address.", "البريد الإلكتروني غير صحيح.")).max(255),
    subject: z.string().trim().min(2, t("Please enter a subject.", "الرجاء إدخال الموضوع.")).max(150),
    message: z.string().trim().min(10, t("Message must be at least 10 characters.", "يجب ألا تقل الرسالة عن ١٠ أحرف.")).max(2000),
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: t("Contact Us", "اتصل بنا"),
    url: "https://www.techsnds.com/contact",
    inLanguage: ["ar", "en"],
    mainEntity: {
      "@type": "Organization",
      name: "TechSNDS",
      url: "https://www.techsnds.com/",
      email: SITE_EMAIL,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SITE_EMAIL,
          telephone: `+${SITE_PHONE}`,
          availableLanguage: ["ar", "en"],
        },
      ],
    },
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSending(true);
    const { name, email, subject, message } = parsed.data;
    const { error: dbError } = await supabase
      .from("contact_messages")
      .insert({ name: name!, email: email!, subject: subject!, message: message! });
    setSending(false);
    if (dbError) {
      setError(t("Sending failed. Please try again.", "تعذّر الإرسال، الرجاء المحاولة مرة أخرى."));
      return;
    }
    setSent(true);
    setForm({ name: "", email: "", subject: "", message: "" });
  };

  const channels = [
    { label: t("Email", "البريد الإلكتروني"), value: SITE_EMAIL, href: `mailto:${SITE_EMAIL}`, Icon: Mail },
    { label: t("WhatsApp", "واتساب"), value: "+966 56 872 9799", href: `https://wa.me/${SITE_PHONE}`, Icon: MessageCircle },
    { label: t("SMS", "رسالة نصية"), value: "+966 56 872 9799", href: `sms:+${SITE_PHONE}`, Icon: Send },
    { label: t("Call", "اتصال مباشر"), value: "+966 56 872 9799", href: `tel:+${SITE_PHONE}`, Icon: Phone },
  ];

  return (
    <StaticPageShell
      title={t("Contact Us | TechSNDS", "اتصل بنا | النخبة الإسلامية TechSNDS")}
      description={t(
        "Contact the TechSNDS team for support, suggestions or partnership requests by form, email or WhatsApp.",
        "تواصل مع فريق TechSNDS للدعم أو الاقتراحات أو طلبات الشراكة عبر النموذج أو البريد الإلكتروني أو واتساب.",
      )}
      path="/contact"
      heading={t("Contact Us", "اتصل بنا")}
      intro={t(
        "We are happy to receive your questions, suggestions and issue reports — we usually reply within 24 hours.",
        "يسعدنا استقبال أسئلتك واقتراحاتك وبلاغاتك، وعادةً نرد خلال ٢٤ ساعة.",
      )}
      jsonLd={jsonLd}
    >
      <InfoCard title={t("Send a message", "أرسل رسالة")}>
        {sent ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-accent" />
            <p className="font-display text-base font-bold text-foreground">
              {t("Your message has been sent successfully!", "تم إرسال رسالتك بنجاح!")}
            </p>
            <p className="text-[13px]">
              {t("Thank you for reaching out — we will get back to you soon.", "شكراً لتواصلك معنا، سنرد عليك في أقرب وقت.")}
            </p>
            <Button variant="outline" className="mt-2" onClick={() => setSent(false)}>
              {t("Send another message", "إرسال رسالة أخرى")}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-1 block text-[12px] font-semibold">{t("Name", "الاسم")}</label>
                <Input id="name" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Your full name", "اسمك الكامل")} />
              </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-[12px] font-semibold">{t("Email", "البريد الإلكتروني")}</label>
                <Input id="email" type="email" dir="ltr" value={form.email} maxLength={255} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="mb-1 block text-[12px] font-semibold">{t("Subject", "الموضوع")}</label>
              <Input id="subject" value={form.subject} maxLength={150} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={t("Message subject", "موضوع الرسالة")} />
            </div>
            <div>
              <label htmlFor="message" className="mb-1 block text-[12px] font-semibold">{t("Message", "الرسالة")}</label>
              <Textarea id="message" rows={6} value={form.message} maxLength={2000} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={t("Write your message here...", "اكتب رسالتك هنا...")} />
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={sending} className="h-12 w-full text-base font-bold">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Send message", "إرسال الرسالة")}
            </Button>
          </form>
        )}
      </InfoCard>

      <InfoCard title={t("Direct channels", "قنوات التواصل المباشرة")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {channels.map((c) => (
            <a
              key={c.label}
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-foreground/10 p-3 transition hover:bg-foreground/5 active:scale-[0.98]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <c.Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{c.label}</span>
                <span className="block truncate text-[11px] text-foreground/60" dir="ltr">{c.value}</span>
              </span>
            </a>
          ))}
        </div>
      </InfoCard>
    </StaticPageShell>
  );
}
